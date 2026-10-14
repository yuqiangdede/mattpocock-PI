/** Conservative navigation hints, never an acceptance or delivery gate. */
export function reviewOutcome(content: string): "clear" | "findings" | "unknown" {
  if (/\[P[0-3]\]/i.test(content)) return "findings";
  const json = content.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
  try {
    const value: unknown = JSON.parse(json);
    if (value && typeof value === "object" && "findings" in value && Array.isArray(value.findings)) {
      if (value.findings.length) return "findings";
      if ("overall_correctness" in value && value.overall_correctness !== "patch is correct") return "unknown";
      return "clear";
    }
  } catch { /* Unstructured reviews need an explicit standalone conclusion. */ }
  if (/^\s*(?:No (?:actionable )?findings(?: found)?|No blocking (?:issues|findings)(?: found)?|未发现(?:可操作的?|需要修复的?)?(?:问题|缺陷)|无(?:阻塞问题|审查问题))\s*[。.！!]?\s*$/i.test(content.trim())) return "clear";
  return "unknown";
}
