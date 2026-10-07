import { ENGINEERING_SHORTCUTS, CodingActionRegistry, type CodingAction, type CodingActionConfiguration, type ComposerCommand, type EngineeringShortcutAction } from "@pi-desktop/shared";

export type CodingShortcut = { action: CodingAction; configured: boolean };

/** Common entries remain visible without rewriting saved Actions. */
export function codingShortcutMenu(configuration: CodingActionConfiguration, catalog: ComposerCommand[], labels: { ask: string; diagnose: string; skillLabels?: Readonly<Record<string, string>> }) {
  const registry = new CodingActionRegistry(configuration);
  const all = registry.list();
  const common = (skillId: string, label: string): CodingShortcut => {
    const action = all.find(action => action.skillId === skillId);
    return { action: action ?? { id: `catalog:${skillId}`, skillId, label }, configured: Boolean(action) };
  };
  const ask = common("ask-matt", labels.ask);
  const diagnose = common("diagnosing-bugs", labels.diagnose);
  const commonIds = new Set([ask.action.id, diagnose.action.id]);
  const enabled = registry.list(true).filter(action => !commonIds.has(action.id));
  const primary = [ask, ...enabled.slice(0, 6).map(action => ({ action, configured: true })), diagnose];
  // Native availability is resolved by PI; only known Matt shortcuts are added to More.
  const more: CodingShortcut[] = enabled.slice(6).map(action => ({ action, configured: true }));
  const represented = new Set([...all.map(action => action.skillId), ask.action.skillId, diagnose.action.skillId]);
  for (const entry of ENGINEERING_SHORTCUTS) {
    if (represented.has(entry.skill)) continue;
    const command = catalog.find(command => command.kind === "skill" && command.skillId === entry.skill);
    if (!command) continue;
    represented.add(entry.skill);
    more.push({ configured: false, action: { id: `catalog:${entry.skill}`, skillId: entry.skill, label: labels.skillLabels?.[entry.action] ?? entry.skill } });
  }
  return { primary, more };
}

export const CODING_SHORTCUT_GROUPS = ["exploration", "design", "development", "maintenance", "delivery", "custom"] as const;
export type CodingShortcutGroup = typeof CODING_SHORTCUT_GROUPS[number];
const shortcutGroups: Record<EngineeringShortcutAction, CodingShortcutGroup> = {
  ask: "exploration", discovery: "exploration", grillMe: "exploration", grilling: "exploration",
  questionnaire: "exploration", research: "exploration",
  initialize: "design", spec: "design", tickets: "design", prototype: "design",
  codebaseDesign: "design", domainModeling: "design", wayfinder: "design",
  implement: "development", tdd: "development",
  diagnose: "maintenance", review: "maintenance", triage: "maintenance",
  improveArchitecture: "maintenance", resolveConflicts: "maintenance",
  handoff: "delivery", retro: "delivery", teach: "delivery", waitWhat: "delivery",
  wizard: "delivery", writingForAgents: "delivery",
};

/** Presentation groups do not impose stages or modify the persisted Action order. */
export function groupCodingShortcuts(shortcuts: readonly CodingShortcut[]) {
  return CODING_SHORTCUT_GROUPS.map(id => ({
    id,
    shortcuts: shortcuts.filter(shortcut => {
      const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === shortcut.action.skillId);
      return (entry ? shortcutGroups[entry.action] : "custom") === id;
    }),
  })).filter(group => group.shortcuts.length > 0);
}
