import { configurationFromLegacyPrompts } from "./shortcut-migration";
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
  async listBackups(): Promise<string[]> {
    const valid: string[] = [];
    for (const kind of ["shortcut-backups", "shortcut-migration-backups"] as const) {
      const directory = path.join(this.directory, kind);
      let entries: string[];
      try { entries = await fs.readdir(directory); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      for (const entry of entries) {
        if (!/^[0-9]+-[a-f0-9-]+\.json$/.test(entry)) continue;
        try {
          const value: unknown = JSON.parse(await fs.readFile(path.join(directory, entry), "utf8"));
          if (kind === "shortcut-backups") validateShortcutConfiguration(value); else configurationFromLegacyPrompts(value);
          valid.push(kind === "shortcut-backups" ? entry : `migration:${entry}`);
        } catch { /* 损坏备份不提供为恢复选项。 */ }
      }
    }
    return valid.sort().reverse();
  }
  async restore(backupId?: string): Promise<ShortcutConfiguration> {
    return this.exclusive(async () => {
      let next = createDefaultShortcutConfiguration();
      if (backupId !== undefined) {
        if (typeof backupId !== "string" || !/^(migration:)?[0-9]+-[a-f0-9-]+\.json$/.test(backupId)) throw new Error("备份标识无效");
        const migration = backupId.startsWith("migration:");
        const value: unknown = JSON.parse(await fs.readFile(path.join(this.directory, migration ? "shortcut-migration-backups" : "shortcut-backups", migration ? backupId.slice(10) : backupId), "utf8"));
        if (migration) next = configurationFromLegacyPrompts(value);
        else { validateShortcutConfiguration(value); next = value; }
      }
      // 恢复允许损坏配置，但必须先逐字节保全当前文件。
      let original: Buffer | null = null;
      try { original = await fs.readFile(this.file); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (original !== null) {
        const backupDir = path.join(this.directory, "shortcut-backups");
        await fs.mkdir(backupDir, { recursive: true });
        await fs.writeFile(path.join(backupDir, `${Date.now()}-${randomUUID()}.json`), original, { flag: "wx" });
      }
      await this.writeAtomic(next); return next;
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
