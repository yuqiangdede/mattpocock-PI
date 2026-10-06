import { resolveShortcutText, type ShortcutConfiguration, type SkillShortcut } from "@pi-desktop/shared";

export function appendShortcut(config: ShortcutConfiguration, button: SkillShortcut): ShortcutConfiguration {
  if (config.buttons.length >= 256) throw new Error("最多配置 256 个按钮，请先删除不需要的按钮。");
  return { ...config, buttons: [...config.buttons, button] };
}
export function copyShortcut(button: SkillShortcut, id: string, translate: (key: string) => string): SkillShortcut {
  const text = resolveShortcutText(button, translate);
  const copy = { ...button, id, binding: { ...button.binding }, ...text, name: `${text.name.slice(0, 125)} 副本` };
  delete copy.presetId;
  return copy;
}
export function deleteShortcut(config: ShortcutConfiguration, id: string): ShortcutConfiguration {
  const button = config.buttons.find(item => item.id === id);
  return { ...config, buttons: config.buttons.filter(item => item.id !== id), deletedPresetIds: button?.presetId ? [...new Set([...config.deletedPresetIds, button.presetId])] : config.deletedPresetIds };
}
export function moveShortcut(config: ShortcutConfiguration, id: string, direction: -1 | 1): ShortcutConfiguration {
  const index = config.buttons.findIndex(item => item.id === id);
  const button = config.buttons[index];
  if (!button) return config;
  const peers = config.buttons.filter(item => item.position === button.position && (button.position === "primary" || item.group === button.group));
  const peer = peers[peers.findIndex(item => item.id === id) + direction];
  if (!peer) return config;
  const target = config.buttons.findIndex(item => item.id === peer.id);
  const buttons = [...config.buttons];
  [buttons[index], buttons[target]] = [buttons[target]!, buttons[index]!];
  return { ...config, buttons };
}
