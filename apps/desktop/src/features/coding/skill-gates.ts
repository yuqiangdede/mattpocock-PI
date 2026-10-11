/** Display-only guidance, shared by shortcut tooltips and the task graph viewer.
 * This metadata never authorizes a command or bypasses CLI permissions/Hooks.
 */
export type SkillGate = "scope" | "tests" | "review" | "publish" | "hooks";
export type SkillGateMetadata = {
  gates: readonly SkillGate[];
  enforcement: "cli-permissions-or-hooks";
  entry?: "task-graph-viewer";
};
const entries: Readonly<Record<string, SkillGateMetadata>> = {
  implement: { gates: ["scope", "tests"], enforcement: "cli-permissions-or-hooks" },
  "implement-spec": { gates: ["scope", "tests", "review"], enforcement: "cli-permissions-or-hooks", entry: "task-graph-viewer" },
  "to-spec": { gates: ["scope"], enforcement: "cli-permissions-or-hooks" },
  "to-tickets": { gates: ["scope", "review"], enforcement: "cli-permissions-or-hooks" },
  "code-review": { gates: ["review"], enforcement: "cli-permissions-or-hooks" },
  pr: { gates: ["review", "tests", "publish"], enforcement: "cli-permissions-or-hooks" },
  "setup-pre-commit": { gates: ["hooks", "tests"], enforcement: "cli-permissions-or-hooks" },
  tdd: { gates: ["scope", "tests"], enforcement: "cli-permissions-or-hooks" },
  "git-guardrails-claude-code": { gates: ["hooks"], enforcement: "cli-permissions-or-hooks" },
};
export function skillGateMetadata(skillId: string): SkillGateMetadata | undefined {
  return Object.hasOwn(entries, skillId) ? entries[skillId] : undefined;
}
