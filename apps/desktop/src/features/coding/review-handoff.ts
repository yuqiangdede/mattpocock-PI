import { skillHandoff } from "./skill-handoff.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Extract navigation hints, never infer acceptance or promote a finding to a confirmed defect. */
export function reviewHandoff(content: string): string {
  const source = content.trim().replace(/^(`{3,}|~{3,})(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n\1$/i, "$2");
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { return skillHandoff("", content, 350); }
  if (!isRecord(value) || !Array.isArray(value.findings)) return "";
  const lines = value.findings.flatMap((finding: unknown) => {
    if (!isRecord(finding) || typeof finding.title !== "string") return [];
    const location = finding.code_location;
    let path = "";
    if (isRecord(location) && typeof location.absolute_file_path === "string") {
      path = location.absolute_file_path;
      const range = location.line_range;
      if (isRecord(range) && Number.isInteger(range.start)) path += `:${range.start}`;
    }
    return [path ? `${finding.title} — ${path}` : finding.title];
  });
  if (typeof value.overall_correctness === "string") lines.push(`overall_correctness: ${value.overall_correctness}`);
  return skillHandoff("", lines.join("\n"), 350);
}
