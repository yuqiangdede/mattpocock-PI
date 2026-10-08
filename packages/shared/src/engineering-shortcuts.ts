export const CODING_SKILL_SHORTCUTS = [
  { action: "initialize", skill: "setup-matt-pocock-skills" },
  { action: "discovery", skill: "grill-with-docs" },
  { action: "spec", skill: "to-spec" },
  { action: "tickets", skill: "to-tickets" },
  { action: "implement", skill: "implement" },
  { action: "diagnose", skill: "diagnosing-bugs" },
  { action: "review", skill: "code-review" },
  { action: "retro", skill: "retro" },
] as const;

/** Matt skills that are useful from the coding workbench but do not need a visible shortcut. */
export const CODING_MORE_SKILLS = [
  { action: "implementSpec", skill: "implement-spec" },
  { action: "pr", skill: "pr" },
  { action: "claudeHandoff", skill: "claude-handoff" },
  { action: "loopMe", skill: "loop-me" },
  { action: "setupTsDeepModules", skill: "setup-ts-deep-modules" },
  { action: "writingBeats", skill: "writing-beats" },
  { action: "writingFragments", skill: "writing-fragments" },
  { action: "writingShape", skill: "writing-shape" },
  { action: "gitGuardrails", skill: "git-guardrails-claude-code" },
  { action: "migrateToShoehorn", skill: "migrate-to-shoehorn" },
  { action: "scaffoldExercises", skill: "scaffold-exercises" },
  { action: "setupPreCommit", skill: "setup-pre-commit" },
  { action: "grillMe", skill: "grill-me" },
  { action: "grilling", skill: "grilling" },
  { action: "handoff", skill: "handoff" },
  { action: "prototype", skill: "prototype" },
  { action: "improveArchitecture", skill: "improve-codebase-architecture" },
  { action: "codebaseDesign", skill: "codebase-design" },
  { action: "domainModeling", skill: "domain-modeling" },
  { action: "tdd", skill: "tdd" },
  { action: "wayfinder", skill: "wayfinder" },
  { action: "triage", skill: "triage" },
  { action: "research", skill: "research" },
  { action: "resolveConflicts", skill: "resolving-merge-conflicts" },
  { action: "teach", skill: "teach" },
  { action: "questionnaire", skill: "to-questionnaire" },
  { action: "waitWhat", skill: "wait-what" },
  { action: "wizard", skill: "wizard" },
  { action: "writingForAgents", skill: "writing-for-agents" },
] as const;

export const ENGINEERING_SHORTCUTS = [...CODING_SKILL_SHORTCUTS, { action: "ask", skill: "ask-matt" }, ...CODING_MORE_SKILLS] as const;
export type EngineeringShortcutAction = typeof ENGINEERING_SHORTCUTS[number]["action"];
export type EngineeringShortcutPrompts = Partial<Record<EngineeringShortcutAction, string | null>>;
export type EngineeringSkillUpdateMode = "auto-check" | "manual";
export type EngineeringSkillCheck = { attemptedAt: number; checkedAt?: number; latestRevision?: string; error?: string; preserved?: string[] };
export type EngineeringSkillStatus = EngineeringSkillCheck & { revision: string; checking: boolean; updating: boolean; hasBackup?: boolean; tasksRunning?: boolean };
export const ENGINEERING_PROMPT_MAX_LENGTH = 16000;
export const ENGINEERING_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

export function resolveShortcutInstruction(action: EngineeringShortcutAction, defaults: string, overrides?: EngineeringShortcutPrompts): string {
  return overrides?.[action] ?? defaults;
}

/** Validate at each public settings boundary; null restores a localized default. */
export function validateEngineeringSettings(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid engineering settings");
  const settings = value as Record<string, unknown>;
  const fail = (field: string): never => { throw Object.assign(new Error(field + " is invalid"), { errorCode: "INVALID_PARAMS" }); };
  if (settings.engineeringSkillUpdateMode !== undefined && (settings.engineeringSkillUpdateMode !== "auto-check" && settings.engineeringSkillUpdateMode !== "manual")) fail("engineeringSkillUpdateMode");
  if (settings.engineeringShortcutPrompts !== undefined) {
    const prompts = settings.engineeringShortcutPrompts;
    if (!prompts || typeof prompts !== "object" || Array.isArray(prompts)) fail("engineeringShortcutPrompts");
    for (const [key, prompt] of Object.entries(prompts as Record<string, unknown>)) {
      if (!ENGINEERING_SHORTCUTS.some(item => item.action === key) || (prompt !== null && (typeof prompt !== "string" || prompt.length > ENGINEERING_PROMPT_MAX_LENGTH || prompt.includes("\0")))) fail("engineeringShortcutPrompts");
    }
  }
  if (settings.engineeringSkillCheck !== undefined) {
    const state = settings.engineeringSkillCheck;
    if (!state || typeof state !== "object" || Array.isArray(state)) fail("engineeringSkillCheck");
    const check = state as Record<string, unknown>;
    for (const key of ["attemptedAt", "checkedAt"]) if (check[key] !== undefined && (typeof check[key] !== "number" || !Number.isSafeInteger(check[key]) || Number(check[key]) < 0)) fail("engineeringSkillCheck");
    if (typeof check.attemptedAt !== "number") fail("engineeringSkillCheck");
    if (check.latestRevision !== undefined && (typeof check.latestRevision !== "string" || !/^[a-f0-9]{40}$/.test(check.latestRevision))) fail("engineeringSkillCheck");
    if (check.error !== undefined && (typeof check.error !== "string" || check.error.length > 1000)) fail("engineeringSkillCheck");
    if (check.preserved !== undefined && (!Array.isArray(check.preserved) || check.preserved.length > 128 || check.preserved.some(id => typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(id)))) fail("engineeringSkillCheck");
  }
}

/** Detection metadata is Main-owned; stale renderer snapshots must not rewind it. */
export function engineeringSettingsForWrite<T>(value: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const writable = { ...value };
    Reflect.deleteProperty(writable, "engineeringSkillCheck");
    return writable;
  }
  return value;
}
