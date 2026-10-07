import { navigatorSessionInput } from "./navigator.js";

export type NavigatorSuggestion = { skillId: string; reason: string; basis: string[] };
export type NavigatorAnalysis = {
  id: string; requestId: string; sessionId: string; activityId: string;
  activityVersion: number; createdAt: number; finishedAt: number | null;
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  rawText: string; suggestions: NavigatorSuggestion[]; diagnostic: string | null;
  provenance: Record<string, unknown> | null; stale: boolean;
};
export type NavigatorAnalysisSnapshot = { analyses: NavigatorAnalysis[] };
export type NavigatorAnalysisInput = {
  sessionId: string; activityId: string; expectedVersion: number;
  requestId: string; selectedResultIds: string[];
};
export type NavigatorAnalysisTarget = { sessionId: string; activityId: string };
export type NavigatorAnalysisCancelInput = NavigatorAnalysisTarget & { requestId: string };
export function navigatorAnalysisCancelInput(input: unknown): NavigatorAnalysisCancelInput {
  const target = navigatorAnalysisTarget(input);
  const value = input as Record<string, unknown>;
  if (typeof value.requestId !== "string" || !value.requestId.trim() || value.requestId.length > 256 || value.requestId.includes("\0")) throw new Error("Invalid analysis cancellation");
  return { ...target, requestId: value.requestId };
}
export function navigatorAnalysisTarget(input: unknown): NavigatorAnalysisTarget {
  const { sessionId } = navigatorSessionInput(input);
  const value = input as Record<string, unknown>;
  if (typeof value.activityId !== "string" || !value.activityId.trim() || value.activityId.length > 256 || value.activityId.includes("\0")) throw new Error("Invalid analysis activity");
  return { sessionId, activityId: value.activityId };
}
export function navigatorAnalysisInput(input: unknown): NavigatorAnalysisInput {
  const target = navigatorAnalysisTarget(input);
  const value = input as Record<string, unknown>;
  if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
    typeof value.requestId !== "string" || !value.requestId.trim() || value.requestId.length > 256 || value.requestId.includes("\0") ||
    !Array.isArray(value.selectedResultIds) || value.selectedResultIds.length > 100 ||
    value.selectedResultIds.some(id => typeof id !== "string" || !id || id.length > 256 || id.includes("\0")) ||
    new Set(value.selectedResultIds).size !== value.selectedResultIds.length) throw new Error("Invalid analysis request");
  return { ...target, expectedVersion: Number(value.expectedVersion), requestId: value.requestId, selectedResultIds: value.selectedResultIds };
}
/** Only preparation metadata crosses this boundary. No generated command is executable. */
export function parseNavigatorSuggestions(text: string, availableSkills: ReadonlySet<string>): NavigatorSuggestion[] {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Analysis must return a JSON object");
  const items = (parsed as Record<string, unknown>).suggestions;
  if (!Array.isArray(items) || items.length > 4) throw new Error("Analysis requires zero to four suggestions");
  const seen = new Set<string>();
  return items.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid suggestion");
    const value = item as Record<string, unknown>;
    if (Object.keys(value).some(key => !["skillId", "reason", "basis"].includes(key)) ||
      typeof value.skillId !== "string" || !availableSkills.has(value.skillId) || seen.has(value.skillId) ||
      typeof value.reason !== "string" || !value.reason.trim() || value.reason.length > 4096 ||
      !Array.isArray(value.basis) || value.basis.length > 20 || value.basis.some(b => typeof b !== "string" || !b.trim() || b.length > 4096)) throw new Error("Invalid or unavailable suggested Skill");
    seen.add(value.skillId);
    return { skillId: value.skillId, reason: value.reason, basis: value.basis };
  });
}
