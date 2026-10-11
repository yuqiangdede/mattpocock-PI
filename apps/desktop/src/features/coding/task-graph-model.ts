export const TASK_GRAPH_STATUSES = ["pending", "running", "done", "aborted"] as const;
export type TaskGraphStatus = typeof TASK_GRAPH_STATUSES[number];
export type TaskGraphTask = { id: string; title: string; status: TaskGraphStatus; blockedBy: string[]; url?: string };
export type TaskGraphInspection =
  | { ok: true; tasks: TaskGraphTask[]; frontier: string[] }
  | { ok: false; error: "json" | "shape" | "duplicate" | "dependency" | "cycle" | "url" | "limit" };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
const status = (value: unknown): value is TaskGraphStatus => TASK_GRAPH_STATUSES.some(entry => entry === value);

/** A bounded, read-only projection; frontier is informational, never a dispatch queue. */
export function inspectTaskGraph(json: string): TaskGraphInspection {
  if (json.length > 1_000_000) return { ok: false, error: "limit" };
  let graph: unknown;
  try { graph = JSON.parse(json); } catch { return { ok: false, error: "json" }; }
  if (!record(graph) || !Array.isArray(graph.tasks)) return { ok: false, error: "shape" };
  if (graph.tasks.length > 1000) return { ok: false, error: "limit" };
  const tasks: TaskGraphTask[] = [];
  const ids = new Set<string>();
  for (const value of graph.tasks) {
    if (!record(value) || !text(value.id) || !text(value.title) || !status(value.status)) return { ok: false, error: "shape" };
    const dependencies: unknown = value.blockedBy === undefined ? [] : value.blockedBy;
    if (!Array.isArray(dependencies) || !dependencies.every(text)) return { ok: false, error: "shape" };
    if (ids.has(value.id)) return { ok: false, error: "duplicate" };
    ids.add(value.id);
    let url: string | undefined;
    if (value.url !== undefined) {
      if (!text(value.url)) return { ok: false, error: "url" };
      try {
        const parsed = new URL(value.url);
        if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return { ok: false, error: "url" };
        url = parsed.href;
      } catch { return { ok: false, error: "url" }; }
    }
    tasks.push({ id: value.id, title: value.title, status: value.status, blockedBy: [...new Set<string>(dependencies)], ...(url ? { url } : {}) });
  }
  if (tasks.some(task => task.blockedBy.some(id => !ids.has(id)))) return { ok: false, error: "dependency" };
  // Kahn's algorithm checks the whole graph, including completed tasks, without recursion.
  const counts = new Map(tasks.map(task => [task.id, task.blockedBy.length]));
  const followers = new Map<string, string[]>();
  for (const task of tasks) for (const id of task.blockedBy) followers.set(id, [...(followers.get(id) ?? []), task.id]);
  const ready = tasks.filter(task => task.blockedBy.length === 0).map(task => task.id);
  let visited = 0;
  while (ready.length) {
    const id = ready.pop();
    if (id === undefined) break;
    visited++;
    for (const next of followers.get(id) ?? []) {
      const remaining = (counts.get(next) ?? 0) - 1;
      counts.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }
  if (visited !== tasks.length) return { ok: false, error: "cycle" };
  const completed = new Set(tasks.filter(task => task.status === "done").map(task => task.id));
  return { ok: true, tasks, frontier: tasks.filter(task => task.status === "pending" && task.blockedBy.every(id => completed.has(id))).map(task => task.id) };
}
