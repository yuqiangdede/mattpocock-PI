import { createDefaultShortcutConfiguration, validateShortcutConfiguration, type ShortcutConfiguration } from "./skill-shortcuts.js";

export type ShortcutPresetUpdate = { presetId: string; kind: "added" | "changed" | "deleted" | "untracked" };
export function getShortcutPresetUpdates(configuration: ShortcutConfiguration, defaults = createDefaultShortcutConfiguration()): ShortcutPresetUpdate[] {
  return defaults.buttons.flatMap<ShortcutPresetUpdate>(preset => {
    const id = preset.presetId!;
    const existing = configuration.buttons.some(button => button.presetId === id);
    const previous = configuration.presetBaseline?.[id];
    const current = defaults.presetBaseline?.[id];
    // 无基线的旧配置只能明确提示待核对，不能推断用户修改等于预置升级。
    if (!existing) {
      const deleted = configuration.deletedPresetIds.includes(id);
      if (deleted && previous === current) return [];
      return [{ presetId: id, kind: deleted ? "deleted" : "added" }];
    }
    if (!previous) return [{ presetId: id, kind: "untracked" }];
    return previous !== current ? [{ presetId: id, kind: "changed" }] : [];
  });
}

export function applyShortcutPresetUpdates(configuration: ShortcutConfiguration, selected: string[], defaults = createDefaultShortcutConfiguration()): ShortcutConfiguration {
  const next = structuredClone(configuration);
  const candidates = getShortcutPresetUpdates(configuration, defaults);
  for (const id of new Set(selected)) {
    if (!candidates.some(item => item.presetId === id)) throw new Error("所选预置不属于待应用内容");
    const preset = defaults.buttons.find(item => item.presetId === id)!;
    let found = false;
    next.buttons = next.buttons.map(button => {
      if (button.presetId !== id) return button;
      found = true;
      // 内容恢复保留用户布局、启用状态与稳定按钮身份。
      const { name, prompt, note, ...rest } = button;
      return { ...rest, binding: { ...preset.binding } };
    });
    if (!found) {
      let buttonId = preset.id;
      let suffix = 1;
      while (next.buttons.some(button => button.id === buttonId)) buttonId = `${preset.id}:${suffix++}`;
      next.buttons.push({ ...structuredClone(preset), id: buttonId });
      next.deletedPresetIds = next.deletedPresetIds.filter(value => value !== id);
    }
    next.presetBaseline = { ...next.presetBaseline, [id]: defaults.presetBaseline![id]! };
  }
  validateShortcutConfiguration(next);
  return next;
}
