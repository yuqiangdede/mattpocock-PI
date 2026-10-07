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
