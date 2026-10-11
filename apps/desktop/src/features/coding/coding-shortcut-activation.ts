type ShortcutEntry = { action: { id: string; skillId: string }; configured: boolean };
type ShortcutCallbacks = { openTaskGraph: () => void; execute: (actionId: string) => void; selectSkill: (skillId: string) => void };
/** Activation remains a UI routing decision, not a workflow executor. */
export function activateCodingShortcut(shortcut: ShortcutEntry, callbacks: ShortcutCallbacks): void {
  if (shortcut.action.skillId === "implement-spec") callbacks.openTaskGraph();
  else if (shortcut.configured) callbacks.execute(shortcut.action.id);
  else callbacks.selectSkill(shortcut.action.skillId);
}
