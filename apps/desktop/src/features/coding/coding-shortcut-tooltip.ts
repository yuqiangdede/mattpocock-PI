import { ENGINEERING_SHORTCUTS, type ComposerCommand } from "@pi-desktop/shared";
import type { TFunction } from "i18next";
import type { CodingShortcut } from "./coding-shortcut-menu";

const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Preserve the full editable guidance shown in settings. */
export function codingShortcutDescription(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  const { action } = shortcut;
  const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === action.skillId);
  if (shortcut.configured && action.description) return action.description;
  return entry
    ? ["when", "purpose", "example"].map(part => t(`coding.skillGuides.${entry.action}.${part}`)).join("\n\n")
    : catalog.find(command => command.kind === "skill" && command.skillId === action.skillId)?.description || action.label;
}

/** Keep launcher help to exactly two purposeful lines. */
export function codingShortcutTooltip(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  const { action } = shortcut;
  const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === action.skillId);
  const configuredWhen = shortcut.configured && action.description ? oneLine(action.description) : "";
  const when = configuredWhen || (entry
    ? t(`coding.skillGuides.${entry.action}.when`)
    : catalog.find(command => command.kind === "skill" && command.skillId === action.skillId)?.description || action.label);
  const example = entry
    ? t(`coding.skillGuides.${entry.action}.example`)
    : t("codingActions.tooltipFallbackExample", { skill: action.label, defaultValue: `Use ${action.label} for the current task.` });
  return `${oneLine(when)}\n${oneLine(example)}`;
}
