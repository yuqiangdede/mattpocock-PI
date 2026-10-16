/** Isolated visual-grilling state. Pi Sessions remain owned by the existing Host. */
import { grillReplyObjects } from "./grill-reply-format";
export type GrillOption = { key: string; label: string };
export type GrillThreadEntry = { id: string; who: "user" | "agent"; text: string; at: string };
export type GrillQuestion = {
  id: string;
  title: string;
  body: string;
  options: GrillOption[];
  recommended: string[];
  why: string;
  multi: boolean;
  selected: string[];
  status: "open" | "confirmed" | "deferred";
  thread: GrillThreadEntry[];
  customAnswer?: string;
};
export type GrillOperation = {
  id: string;
  kind: "round" | "discuss" | "finish";
  questionId?: string;
  text: string;
  submittedAt: string;
  retryCount?: number;
};
export function canAutoRetryGrill(operation: GrillOperation, result: {status: string; finishedAt: number} | undefined, running: boolean): boolean {
  return !running && (operation.retryCount ?? 0) < 3 && result?.status === "completed" &&
    result.finishedAt >= Date.parse(operation.submittedAt);
}
export type GrillState = {
  version: 1;
  sessionId: string;
  topic: string;
  questions: GrillQuestion[];
  selectedId: string | null;
  round: number;
  pending: GrillOperation | null;
  finished: boolean;
  finishNote: string;
  noMoreQuestions?: boolean;
};
export type GrillReply =
  | { requestId: string; kind: "questions"; questions: Array<{ title: string; body: string; options: GrillOption[]; recommended: string[]; why: string; multi: boolean }> }
  | { requestId: string; kind: "discussion"; questionId: string; reply: string }
  | { requestId: string; kind: "finished"; note: string };

const PREFIX = "mattpocock.pi.native-grill.v1.";
const bounded = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function newGrill(sessionId: string, topic: string): GrillState {
  return { version: 1, sessionId, topic: topic.trim().slice(0, 200), questions: [], selectedId: null, round: 0, pending: null, finished: false, finishNote: "" };
}
function validOption(value: unknown): value is GrillOption {
  return plain(value) && typeof value.key === "string" && /^[A-Z]$/.test(value.key) && typeof value.label === "string" && value.label.length > 0 && value.label.length <= 600;
}
function validSelection(value: unknown, options: GrillOption[]): boolean {
  return Array.isArray(value) && value.every(key => typeof key === "string" && (key === "OTHER" || options.some(option => option.key === key)));
}
export function setGrillCustomAnswer(state: GrillState, id: string, text: string): GrillState {
  if (state.pending || state.finished) return state;
  return {...state, questions: state.questions.map(q => q.id === id && q.status === "open" ? {...q, customAnswer:text.slice(0,3000)} : q)};
}
/** Model output is untrusted; ignore accidental markup, forged request IDs and malformed payloads. */
export function parseGrillReply(content: string, expected: GrillOperation): GrillReply | null {
  const matches = grillReplyObjects(content).filter(value => plain(value) &&
    (value.requestId ?? value.request_id) === expected.id);
  if (matches.length !== 1 || !plain(matches[0])) return null;
  const value = matches[0];
  if (value.requestId !== undefined && value.request_id !== undefined && value.requestId !== value.request_id) return null;
  if (value.questionId !== undefined && value.question_id !== undefined && value.questionId !== value.question_id) return null;
  const questionId = value.questionId ?? value.question_id;
  const kind = value.kind ?? (Array.isArray(value.questions) ? "questions" : typeof value.reply === "string" ? "discussion" : typeof value.note === "string" ? "finished" : undefined);
  if (expected.kind === "discuss") {
    if (kind !== "discussion" || questionId !== expected.questionId || !bounded(value.reply, 8000)) return null;
    return { kind: "discussion", requestId: expected.id, questionId: expected.questionId!, reply: bounded(value.reply, 8000) };
  }
  if (expected.kind === "finish") {
    if (kind !== "finished" || !bounded(value.note, 2000)) return null;
    return { kind: "finished", requestId: expected.id, note: bounded(value.note, 2000) };
  }
  if (kind !== "questions" || !Array.isArray(value.questions) || value.questions.length > 3) return null;
  const questions: Extract<GrillReply, { kind: "questions" }>["questions"] = [];
  for (const q of value.questions) {
    if (!plain(q) || !bounded(q.title, 250) || !bounded(q.body, 3000) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 5 || !q.options.every(validOption)) return null;
    const opts = q.options as GrillOption[];
    if (new Set(opts.map(o => o.key)).size !== opts.length) return null;
    const multi = q.multi === true;
    const recommended = Array.isArray(q.recommended) ? q.recommended : typeof q.recommended === "string" ? [q.recommended] : [];
    if (!recommended.every(k => typeof k === "string" && opts.some(o => o.key === k)) || !recommended.length || (!multi && recommended.length !== 1)) return null;
    questions.push({ title: bounded(q.title, 250), body: bounded(q.body, 3000), options: opts.map(o => ({ key: o.key, label: bounded(o.label, 600) })), recommended: recommended as string[], multi, why: bounded(q.why, 3000) });
  }
  return { kind: "questions", requestId: expected.id, questions };
}
export function applyGrillReply(state: GrillState, reply: GrillReply): GrillState {
  if (!state.pending || state.pending.id !== reply.requestId || state.finished) return state;
  if (reply.kind === "discussion") {
    const question = state.questions.find(q => q.id === reply.questionId);
    if (!question) return state;
    return { ...state, pending: null, questions: state.questions.map(q => q.id === reply.questionId
      ? { ...q, thread: [...q.thread, { id: reply.requestId, who: "agent" as const, text: reply.reply, at: new Date().toISOString() }].slice(-100) } : q) };
  }
  if (reply.kind === "finished") return { ...state, pending: null, finished: true, finishNote: reply.note };
  const added = reply.questions.map((q, i): GrillQuestion => ({
    ...q, id: `q${state.questions.length + i + 1}`,
    selected: [], status: "open", thread: [],
  }));
  return {
    ...state, pending: null, questions: [...state.questions, ...added].slice(0, 100),
    noMoreQuestions: added.length === 0,
    selectedId: added[0]?.id ?? state.selectedId, round: state.round + 1,
  };
}
export function decideGrillQuestion(state: GrillState, id: string, type: "select" | "confirm" | "defer" | "reopen", selected: string[] = []): GrillState {
  if (state.pending || state.finished) return state;
  return { ...state, questions: state.questions.map(q => {
    if (q.id !== id) return q;
    if (type === "reopen") return { ...q, status: "open" };
    if (type === "defer") return { ...q, status: "deferred" };
    if (type === "select") {
      if (q.status !== "open") return q;
      const keys = selected.filter(k => k === "OTHER" || q.options.some(o => o.key === k));
      return { ...q, selected: q.multi ? keys : keys.slice(0, 1) };
    }
    return q.status === "open" && q.selected.length && (!q.selected.includes("OTHER") || Boolean(q.customAnswer?.trim())) ? { ...q, status: "confirmed" } : q;
  }) };
}
export function grillNavigation(state: GrillState): { next: boolean; finish: boolean } {
  const settled = !state.pending && !state.finished && state.questions.every(q => q.status !== "open");
  const exhausted = state.noMoreQuestions === true || state.questions.length >= 100;
  return { next: settled && !exhausted, finish: settled && exhausted };
}
export function acceptGrillRecommendations(state: GrillState): GrillState {
  if (state.pending || state.finished) return state;
  const undecided = state.questions.filter(q => q.status !== "confirmed");
  if (!undecided.length || undecided.some(q => !q.recommended.length ||
      (!q.multi && q.recommended.length !== 1) ||
      q.recommended.some(key => !q.options.some(option => option.key === key)))) return state;
  return { ...state, questions: state.questions.map(q => q.status === "confirmed" ? q : {
    ...q, selected: [...new Set(q.recommended)], status: "confirmed",
  }) };
}
export function summaries(state: GrillState): string {
  return state.questions.map(q => {
    const picked = q.selected.map(k => k === "OTHER" ? `Other: ${q.customAnswer?.trim() ?? ""}` : q.options.find(o => o.key === k)?.label ?? k).join(" / ");
    return `${q.id}. ${q.title}: ${q.status === "confirmed" ? "CONFIRMED" : q.status === "deferred" ? "DEFERRED" : "OPEN"} | ${picked || "undecided"}\n  Recent discussion: ${q.thread.slice(-4).map(m => m.who + ": " + m.text).join(" | ").slice(0, 1200)}`;
  }).join("\n").slice(-14000);
}
export function grillPrompt(state: GrillState, operation: GrillOperation): string {
  const common = [
    "You are conducting an iterative requirements interview within mattpocock-PI.",
    "Study the current conversation and relevant project code/documents before suggesting decisions.",
    "Do not implement or change project files during this interview except a design document explicitly requested at Finish.",
    "Do not compile, build or package the project during this interview; compilation is a separate user action.",
    "Never replace confirmed choices with your recommendation. A discussion is not a confirmed answer.",
    "For this workspace action, respond with exactly one <grill-workspace-result> JSON object followed by its closing tag; no Markdown fence.",
    "Use only the JSON keys in the requested schema. Always repeat requestId exactly.",
    `Request ID: ${operation.id}`,
    `Topic: ${state.topic}`,
    `Decisions:\n${summaries(state) || "(none yet)"}`,
  ];
  if (operation.kind === "round") common.push(
    "Ask the next 1-3 independent, consequential design questions; do not repeat settled questions or ask facts you can read from the project.",
    "If no important questions remain, return an empty questions array.",
    'Schema: {"requestId":"ID","kind":"questions","questions":[{"title":"...","body":"...","multi":false,"options":[{"key":"A","label":"..."},{"key":"B","label":"..."}],"recommended":["A"],"why":"explicit tradeoff"}]}',
    "Respond in the user's language. Keep recommendations balanced and specific.",
  );
  if (operation.kind === "discuss") {
    const question = state.questions.find(q => q.id === operation.questionId);
    common.push(`Discuss ONLY question ${operation.questionId}: ${question?.title ?? ""}. ${question?.body ?? ""}`,
      `Options: ${JSON.stringify(question?.options ?? [])}; recommended: ${JSON.stringify(question?.recommended ?? [])}; rationale: ${question?.why ?? ""}`,
      `Previous discussion:\n${(question?.thread ?? []).slice(-12).map(x => `${x.who}: ${x.text}`).join("\n").slice(-6000)}`,
      `User's latest follow-up: ${operation.text}`,
      'Answer the follow-up with concrete reasoning. Do not choose an option for the user.',
      `Schema: {"requestId":"ID","kind":"discussion","questionId":"${operation.questionId}","reply":"..."}`,
    );
  }
  if (operation.kind === "finish") common.push(
    "Summarize all CONFIRMED decisions, rationale and deferred/open questions. If a project workspace is available, write a Markdown design document under docs/ without changing application code; report the actual relative path only after successful write.",
    'Schema: {"requestId":"ID","kind":"finished","note":"Summary and actual created document path, if any"}',
  );
  return common.join("\n\n");
}
export function loadGrill(sessionId: string): GrillState | null {
  if (!sessionId) return null;
  try {
    const raw = localStorage.getItem(PREFIX + sessionId);
    if (!raw || raw.length > 500_000) return null;
    const s: unknown = JSON.parse(raw);
    if (!plain(s) || s.version !== 1 || s.sessionId !== sessionId || !bounded(s.topic, 200) || !Array.isArray(s.questions) || s.questions.length > 100) return null;
    // Reject corrupted or manually edited workflow state before rendering it.
    if (!Number.isSafeInteger(s.round) || (s.round as number) < 0 ||
        (s.selectedId !== null && typeof s.selectedId !== "string") ||
        typeof s.finished !== "boolean" || typeof s.finishNote !== "string" ||
        (s.noMoreQuestions !== undefined && typeof s.noMoreQuestions !== "boolean")) return null;
    if (s.pending !== null && (!plain(s.pending) || typeof s.pending.id !== "string" ||
        !["round", "discuss", "finish"].includes(String(s.pending.kind)) ||
        typeof s.pending.text !== "string" || typeof s.pending.submittedAt !== "string" ||
        (s.pending.retryCount !== undefined && (!Number.isSafeInteger(s.pending.retryCount) || Number(s.pending.retryCount) < 0 || Number(s.pending.retryCount) > 1000)))) return null;
    if (!s.questions.every(q => plain(q) && typeof q.id === "string" &&
      typeof q.title === "string" && typeof q.body === "string" &&
      typeof q.why === "string" && typeof q.multi === "boolean" &&
      Array.isArray(q.options) && q.options.every(validOption) &&
      validSelection(q.selected, q.options) &&
      (q.customAnswer === undefined || (typeof q.customAnswer === "string" && q.customAnswer.length <= 3000)) &&
      Array.isArray(q.recommended) && q.recommended.every((key: unknown) => typeof key === "string") &&
      Array.isArray(q.thread) && q.thread.every((m: unknown) => plain(m) && typeof m.id === "string" &&
        (m.who === "user" || m.who === "agent") && typeof m.text === "string" && typeof m.at === "string") &&
      ["open", "confirmed", "deferred"].includes(String(q.status)))) return null;
    return s as unknown as GrillState;
  } catch { return null; }
}
export function saveGrill(state: GrillState): boolean {
  try {
    localStorage.setItem(PREFIX + state.sessionId, JSON.stringify(state));
    return true;
  } catch { return false; }
}
