const codeChangingSkills = new Set([
  "implement", "implement-spec", "diagnosing-bugs", "tdd", "prototype",
  "improve-codebase-architecture", "resolving-merge-conflicts",
]);

/** Only code-changing skills and commit/repair actions need the separate-build reminder. */
export function withCompileInstruction(text: string, instruction: string, target: { skillId: string } | { promptId: string }): string {
  const required = "skillId" in target
    ? codeChangingSkills.has(target.skillId)
    : target.promptId === "commit-code" || target.promptId === "review-fix";
  return required ? `${text}\n\n${instruction}` : text;
}
