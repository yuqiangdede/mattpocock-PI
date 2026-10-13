import { ENGINEERING_SHORTCUTS, type ComposerCommand } from "@pi-desktop/shared";
import type { TFunction } from "i18next";
import type { CodingShortcut } from "./coding-shortcut-menu";

const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Keep every launcher tooltip to exactly two purposeful lines. */
export function codingShortcutDescription(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  const { action } = shortcut;
  const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === action.skillId);
  const labelWhen = t("codingActions.tooltipWhen", { defaultValue: "什么时候使用" });
  const labelExample = t("codingActions.tooltipExample", { defaultValue: "具体例子" });
  const isChinese = labelWhen === "什么时候使用";
  const configuredWhen = shortcut.configured && action.description ? oneLine(action.description) : "";
  const when = configuredWhen || (entry
    ? t(`coding.skillGuides.${entry.action}.when`)
    : catalog.find(command => command.kind === "skill" && command.skillId === action.skillId)?.description || action.label);
  const example = entry
    ? t(`coding.skillGuides.${entry.action}.example`)
    : isChinese ? `用「${action.label}」处理当前需求。` : `Use ${action.label} for the current task.`;
  return `${labelWhen}：${oneLine(when)}\n${labelExample}：${oneLine(example)}`;
}

export function codingShortcutTooltip(shortcut: CodingShortcut, catalog: ComposerCommand[], t: TFunction): string {
  return codingShortcutDescription(shortcut, catalog, t);
}
