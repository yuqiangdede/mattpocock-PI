import { ENGINEERING_SHORTCUTS, type ComposerCommand } from "@pi-desktop/shared";
import type { TFunction } from "i18next";
import type { CodingShortcut } from "./coding-shortcut-menu";
import { findDocumentShortcut } from "./document-shortcuts";

const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Preserve the full editable guidance shown in settings. */
export function codingShortcutDescription(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  const { action } = shortcut;
  if (shortcut.configured && action.description) return action.description;
  const labelWhen = t("codingActions.tooltipWhen", { defaultValue: "什么时候使用" });
  const labelExample = t("codingActions.tooltipExample", { defaultValue: "具体例子" });
  const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === action.skillId);
  if (entry) {
    const when = t(`coding.skillGuides.${entry.action}.when`);
    const example = t(`coding.skillGuides.${entry.action}.example`);
    return `${labelWhen}：${when}\n\n${labelExample}：${example}`;
  }
  const doc = findDocumentShortcut(action.skillId);
  if (doc) {
    const when = t(`codingActions.${doc.helpKey}TooltipWhen`);
    const example = t(`codingActions.${doc.helpKey}TooltipExample`);
    return `${labelWhen}：${when}\n\n${labelExample}：${example}`;
  }
  return catalog.find(command => command.kind === "skill" && command.skillId === action.skillId)?.description || action.label;
}

/** Keep launcher help to exactly two purposeful lines. */
export function codingShortcutTooltip(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  const { action } = shortcut;
  const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === action.skillId);
  const doc = findDocumentShortcut(action.skillId);
  const labelWhen = t("codingActions.tooltipWhen", { defaultValue: "什么时候使用" });
  const labelExample = t("codingActions.tooltipExample", { defaultValue: "具体例子" });
  const configuredWhen = shortcut.configured && action.description ? oneLine(action.description) : "";
  const when = configuredWhen || (entry
    ? t(`coding.skillGuides.${entry.action}.when`)
    : doc
    ? t(`codingActions.${doc.helpKey}TooltipWhen`)
    : catalog.find(command => command.kind === "skill" && command.skillId === action.skillId)?.description || action.label);
  const example = entry
    ? t(`coding.skillGuides.${entry.action}.example`)
    : doc
    ? t(`codingActions.${doc.helpKey}TooltipExample`)
    : t("codingActions.tooltipFallbackExample", { skill: action.label, defaultValue: `Use ${action.label} for the current task.` });
  return `${labelWhen}：${oneLine(when)}\n${labelExample}：${oneLine(example)}`;
}
