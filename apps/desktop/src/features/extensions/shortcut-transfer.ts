import { validateShortcutConfiguration, type ShortcutConfiguration } from "@pi-desktop/shared";

export function exportShortcutConfiguration(configuration: ShortcutConfiguration): string {
  validateShortcutConfiguration(configuration);
  return JSON.stringify(configuration, null, 2) + "\n";
}

export function parseShortcutImport(text: string): ShortcutConfiguration {
  if (text.length > 8 * 1024 * 1024) throw new Error("导入内容过大，请使用快捷按钮配置 JSON");
  const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  validateShortcutConfiguration(value);
  return value;
}

// 确认发生后才调用统一保存边界，沿用先备份再写入的保护。
export async function confirmShortcutImport(configuration: ShortcutConfiguration, confirmed: boolean, save: (value: ShortcutConfiguration) => Promise<ShortcutConfiguration>) {
  if (!confirmed) return null;
  validateShortcutConfiguration(configuration);
  return save(structuredClone(configuration));
}
