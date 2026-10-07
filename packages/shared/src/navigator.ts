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
};
export type NavigatorSnapshot = { activities: EngineeringActivity[]; unavailableCount: number };
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
