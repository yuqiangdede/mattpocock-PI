import { ENGINEERING_SHORTCUTS, type ComposerCommand } from "@pi-desktop/shared";
import type { TFunction } from "i18next";
import type { CodingShortcut } from "./coding-shortcut-menu";
import { skillGateMetadata } from "./skill-gates";

export function codingShortcutDescription(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  const { action } = shortcut;
  const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === action.skillId);
  const description = shortcut.configured && action.description
    ? action.description
    : entry ? ["when", "purpose", "example"].map(part => t(`coding.skillGuides.${entry.action}.${part}`)).join("\n\n")
      : catalog.find(command => command.kind === "skill" && command.skillId === action.skillId)?.description || action.label;
  return description;
}

export function codingShortcutTooltip(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  const description = codingShortcutDescription(shortcut, catalog, t);
  const gate = skillGateMetadata(shortcut.action.skillId);
  return [description, ...(gate ? [
    ...(gate.entry === "task-graph-viewer" ? [t("taskGraph.purpose")] : []),
    t("skillGates.title"), ...gate.gates.map(item => t(`skillGates.${item}`)), t("skillGates.description"),
  ] : [])].join("\n\n");
}
