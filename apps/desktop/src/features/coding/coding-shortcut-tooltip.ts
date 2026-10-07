import { ENGINEERING_SHORTCUTS, type ComposerCommand } from "@pi-desktop/shared";
import type { TFunction } from "i18next";
import type { CodingShortcut } from "./coding-shortcut-menu";

export function codingShortcutTooltip(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  const { action } = shortcut;
  if (shortcut.configured && action.description) return action.description;
  const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === action.skillId);
  if (entry) return ["when", "purpose", "example"].map(part => t(`coding.skillGuides.${entry.action}.${part}`)).join("\n\n");
  return catalog.find(command => command.kind === "skill" && command.skillId === action.skillId)?.description || action.label;
}
