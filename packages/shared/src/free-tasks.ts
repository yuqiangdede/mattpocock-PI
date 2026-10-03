export const FREE_TASK_ACTIONS = ["discovery", "spec", "tickets", "implement", "initialize", "diagnose", "review", "retro"] as const;
export type FreeTaskAction = typeof FREE_TASK_ACTIONS[number];
export type FreeTaskRequest = {
  requestId: string; sessionId: string; action: FreeTaskAction;
  description: string; references: string[];
  wait?: boolean;
};
export type FreeTask = FreeTaskRequest & {
  id: string; projectPath: string; version: 1; createdAt: number;
  phase: "waiting" | "pending" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
  turnId?: string; error?: string;
  result?: string;
};
export const FREE_TASK_SKILLS: Record<FreeTaskAction, string | null> = {
  discovery: "grill-with-docs", spec: "to-spec", tickets: "to-tickets", implement: "implement",
  initialize: null, diagnose: "diagnosing-bugs", review: "code-review", retro: "retro",
};
export type ProjectInitPreview = {
  id: string; projectPath: string; stack: string;
  files: { path: string; item: string; before: string | null; after: string }[];
  outcomes?: { path: string; status: "completed" | "failed" | "kept"; error?: string; backupPath?: string }[];
  selected?: string[];
};
