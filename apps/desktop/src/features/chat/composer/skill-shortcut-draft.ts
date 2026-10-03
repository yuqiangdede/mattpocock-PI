import { formatCommandInsert } from "@pi-desktop/shared";

/** Preserve the live draft verbatim after the editable shortcut instruction. */
export function buildSkillShortcutDraft(commandName: string, prompt: string, existingDraft: string): string {
  return formatCommandInsert(commandName) + prompt + (existingDraft ? (prompt ? "\n\n" : "") + existingDraft : "");
}
