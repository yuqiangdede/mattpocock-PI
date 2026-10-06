import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDefaultShortcutConfiguration, validateShortcutConfiguration, type ShortcutConfiguration } from "@pi-desktop/shared";
import { migrateEngineeringPrompts } from "./shortcut-migration";

// 同一实例串行写入，备份失败或原配置损坏时禁止覆盖。
export class ShortcutStore {
  readonly directory: string;
  readonly file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dataDir: string) {
    this.directory = path.join(dataDir, "extensions");
    this.file = path.join(this.directory, "skill-shortcuts.json");
  }
  async readExisting(): Promise<ShortcutConfiguration | null> {
    let text: string;
    try { text = await fs.readFile(this.file, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const value: unknown = JSON.parse(text);
    validateShortcutConfiguration(value);
    return value;
  }
  async load(readLegacySettings?: () => Promise<unknown>): Promise<ShortcutConfiguration> {
    return this.exclusive(async () => {
      const existing = await this.readExisting();
      if (existing) return existing;
      const initial = createDefaultShortcutConfiguration();
      if (readLegacySettings) await migrateEngineeringPrompts(this.directory, initial, await readLegacySettings());
      await this.writeAtomic(initial);
      return initial;
    });
  }
  async save(value: unknown): Promise<ShortcutConfiguration> {
    validateShortcutConfiguration(value);
    const snapshot = structuredClone(value);
    return this.exclusive(async () => {
      const previous = await this.readExisting();
      if (previous) {
        const backupDir = path.join(this.directory, "shortcut-backups");
        await fs.mkdir(backupDir, { recursive: true });
        await fs.copyFile(this.file, path.join(backupDir, `${Date.now()}-${randomUUID()}.json`), constants.COPYFILE_EXCL);
      }
      await this.writeAtomic(snapshot);
      return snapshot;
    });
  }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }
  private async writeAtomic(value: ShortcutConfiguration): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = path.join(this.directory, `.skill-shortcuts-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      await fs.rename(temporary, this.file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
}
