/** Additive navigation projection. Native turn outcomes are separate from activity ending. */
export type NavigatorOutcome = "waiting" | "running" | "normal" | "failed" | "cancelled" | "unresolved";
export type EngineeringRequest = {
  id: string;
  messageId: string;
  turnId: string | null;
  requestedSkills: string[];
  outcome: NavigatorOutcome;
  observedSkills: string[];
  errorCode: string | null;
};
export type EngineeringActivity = {
  id: string;
  sessionId: string;
  version: number;
  createdAt: number;
  endedAt: number | null;
  hidden: boolean;
  requests: EngineeringRequest[];
  boundaries?: { version: number; action: "continue" | "end" | "leave"; createdAt: number }[];
};
export type NavigatorSnapshot = { activities: EngineeringActivity[]; unavailableCount: number; activeActivityId?: string | null };
export type NavigatorControlInput = { sessionId: string; activityId: string; expectedVersion: number; action: "continue" | "end" | "leave" };
export function navigatorControlInput(input: unknown): NavigatorControlInput {
  const { sessionId } = navigatorSessionInput(input);
  if (!input || typeof input !== "object" || !("activityId" in input) || typeof input.activityId !== "string" || !input.activityId.trim() || input.activityId.length > 256 || input.activityId.includes("\0") ||
    !("expectedVersion" in input) || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) <= 0 ||
    !("action" in input) || (input.action !== "continue" && input.action !== "end" && input.action !== "leave")) throw new Error("Invalid activity control");
  return { sessionId, activityId: input.activityId, expectedVersion: Number(input.expectedVersion), action: input.action };
}
export type NavigatorResult = {
  id: string; kind: "reply" | "file" | "validation";
  label: string; path: string | null; sourceMessageId: string | null;
  sourceTurnId: string | null; provenance: "native" | "user" | "model_reported";
  verification: "observed" | "unverified";
};
export type NavigatorResultSnapshot = { results: NavigatorResult[]; version: number };
export type NavigatorResultInput = { sessionId: string; activityId: string; expectedVersion?: number; resultId?: string; kind?: "file" | "validation"; label?: string; path?: string };
export function navigatorResultInput(input: unknown): NavigatorResultInput {
  const base = navigatorSessionInput(input);
  if (!input || typeof input !== "object") throw new Error("input required");
  const value = input as Record<string, unknown>;
  if (typeof value.activityId !== "string" || !value.activityId || value.activityId.length > 1024) throw new Error("activityId required");
  for (const key of ["resultId", "label", "path"] as const) if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].length > 4096 || value[key].includes("\0"))) throw new Error(`Invalid ${key}`);
  if (value.expectedVersion !== undefined && (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1)) throw new Error("Invalid version");
  if (value.kind !== undefined && value.kind !== "file" && value.kind !== "validation") throw new Error("Invalid kind");
  return { ...base, activityId: value.activityId, expectedVersion: value.expectedVersion as number | undefined, resultId: value.resultId as string | undefined, kind: value.kind as "file" | "validation" | undefined, label: value.label as string | undefined, path: value.path as string | undefined };
}
export function navigatorSessionInput(input: unknown): { sessionId: string } {
  if (!input || typeof input !== "object" || !("sessionId" in input) ||
      typeof input.sessionId !== "string" || !input.sessionId.trim() || input.sessionId.length > 256) {
    throw new Error("sessionId required");
  }
  return { sessionId: input.sessionId };
}
export function navigatorVisibilityInput(input: unknown): { sessionId: string; activityId: string; hidden: boolean } {
  const session = navigatorSessionInput(input);
  if (!input || typeof input !== "object" || !("activityId" in input) ||
      typeof input.activityId !== "string" || !input.activityId.trim() || input.activityId.length > 256 ||
      input.activityId.includes("\0") || !("hidden" in input) || typeof input.hidden !== "boolean" || session.sessionId.includes("\0")) {
    throw new Error("activityId and hidden required");
  }
  return { ...session, activityId: input.activityId, hidden: input.hidden };
}
