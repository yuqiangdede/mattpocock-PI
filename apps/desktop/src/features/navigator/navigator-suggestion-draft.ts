import type { NavigatorAnalysis, NavigatorSuggestion } from "@pi-desktop/shared";

// Evidence and generated prose remain literal context, not extra slash requests.
const literalContext = (text: string) => text.replace(/[\r\n\t\0]/g, " ").replace(/(^|\s)\//g, "$1\\/");

/** Carry historical references, never the model's commands or entire conversation. */
export function navigatorSuggestionContext(analysis: NavigatorAnalysis, suggestion: NavigatorSuggestion, labels: {
  summary: string; source: string; historical: string;
}): string {
  const lines = [`${labels.summary}: ${literalContext(suggestion.reason)}`, `${labels.source}: activity:${literalContext(analysis.activityId)} analysis:${literalContext(analysis.id)}`, labels.historical];
  const evidence = analysis.provenance?.evidence;
  if (Array.isArray(evidence)) {
    for (const item of evidence) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const value: Record<string, unknown> = item;
      if (typeof value.id !== "string") continue;
      const reference = value.kind === "file" && typeof value.path === "string" ? value.path :
        typeof value.sourceMessageId === "string" ? `message:${value.sourceMessageId}` : `result:${value.id}`;
      lines.push(`- ${literalContext(reference)} (result:${literalContext(value.id)})`);
    }
  }
  return lines.join("\n");
}
