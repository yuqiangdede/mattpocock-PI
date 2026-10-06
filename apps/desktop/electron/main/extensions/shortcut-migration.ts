import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDefaultShortcutConfiguration, validateEngineeringSettings, type ShortcutConfiguration } from "@pi-desktop/shared";

export function configurationFromLegacyPrompts(settings: unknown): ShortcutConfiguration {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("无法读取旧快捷提示词配置");
  const prompts = (settings as Record<string, unknown>).engineeringShortcutPrompts;
  if (prompts === undefined) throw new Error("旧快捷提示词备份缺少来源字段");
  validateEngineeringSettings({ engineeringShortcutPrompts: prompts });
  const initial = createDefaultShortcutConfiguration();
  const snapshot = prompts as Record<string, string | null>;
  for (const button of initial.buttons) {
    const prompt = button.presetId ? snapshot[button.presetId] : undefined;
    // null 与缺省字段都使用当前语言默认值；显式空字符串必须保留。
    if (typeof prompt === "string") button.prompt = prompt;
  }
  initial.migration = { engineeringPrompts: true };
  return initial;
}

// 仅备份迁移所需的旧字段，避免将原生设置中的其他敏感内容复制到扩展目录。
export async function migrateEngineeringPrompts(directory: string, initial: ShortcutConfiguration, settings: unknown): Promise<void> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("无法读取旧快捷提示词配置");
  const prompts = (settings as Record<string, unknown>).engineeringShortcutPrompts;
  if (prompts === undefined) return;
  const snapshot = structuredClone(prompts) as Record<string, string | null>;
  const migrated = configurationFromLegacyPrompts({ engineeringShortcutPrompts: snapshot });
  const backupDir = path.join(directory, "shortcut-migration-backups");
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(path.join(backupDir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ engineeringShortcutPrompts: snapshot }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  Object.assign(initial, migrated);
}
