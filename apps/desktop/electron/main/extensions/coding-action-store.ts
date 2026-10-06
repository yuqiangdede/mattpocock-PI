import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDefaultCodingActions, migrateEngineeringActions, migrateShortcutActions, validateCodingActions, type CodingActionConfiguration, type CodingActionSnapshot } from "@pi-desktop/shared";

export class CodingActionStore {
  private readonly defaultLabels: (settings?: unknown) => Readonly<Record<string, string>>;
  readonly directory: string;
  readonly file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dataDir: string, privateDefaultLabels: (settings?: unknown) => Readonly<Record<string, string>> = () => ({})) {
    this.defaultLabels = privateDefaultLabels;
    this.directory = path.join(dataDir, "extensions");
    this.file = path.join(this.directory, "coding-actions.json");
  }
  async load(readLegacySettings?: () => Promise<unknown>): Promise<CodingActionSnapshot> {
    return this.exclusive(async () => {
      try {
        const text = await this.read(this.file);
        if (text !== null) {
          const configuration: unknown = JSON.parse(text);
          validateCodingActions(configuration);
          return { configuration };
        }
        const legacyFile = path.join(this.directory, "skill-shortcuts.json");
        const legacy = await this.read(legacyFile);
        const settings = legacy === null && readLegacySettings ? await readLegacySettings() : {};
        const configuration = legacy === null ? migrateEngineeringActions(settings, this.defaultLabels(settings)) : migrateShortcutActions(JSON.parse(legacy));
        if (legacy !== null) await this.backupFile(legacyFile, "legacy");
        else if ((settings as { engineeringShortcutPrompts?: unknown }).engineeringShortcutPrompts !== undefined) {
          await this.backup(Buffer.from(JSON.stringify({ engineeringShortcutPrompts: (settings as { engineeringShortcutPrompts: unknown }).engineeringShortcutPrompts }), "utf8"), "legacy");
        }
        await this.writeAtomic(configuration);
        return { configuration, ...(legacy !== null ? { diagnostic: "旧快捷配置已迁移为 Coding Actions；Skill 来源沿用 PI 现有优先级。" } : {}) };
      } catch (cause) {
        // 读取失败只影响附加入口：保留原文件并提供内存默认值，Chat 不受阻塞。
        return { configuration: createDefaultCodingActions(this.defaultLabels()), recoveryRequired: true, diagnostic: `编码 Action 配置不可用，已回退默认；原文件保持不变：${String(cause)}` };
      }
    });
  }
  async save(value: unknown, recover = false): Promise<CodingActionConfiguration> {
    validateCodingActions(value);
    const snapshot = structuredClone(value);
    return this.exclusive(async () => {
      let exists = false;
      try { await fs.stat(this.file); exists = true; }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
      if (exists) {
        if (!recover) { const previous: unknown = JSON.parse((await this.read(this.file))!); validateCodingActions(previous); }
        await this.backupFile(this.file, "actions");
      }
      await this.writeAtomic(snapshot);
      return snapshot;
    });
  }
  async reset(): Promise<CodingActionConfiguration> { return this.save(createDefaultCodingActions(this.defaultLabels()), true); }
  private async read(file: string): Promise<string | null> {
    try {
      if ((await fs.stat(file)).size > 32 * 1024 * 1024) throw new Error("编码 Action 配置过大");
      return await fs.readFile(file, "utf8");
    }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null; throw cause; }
  }
  private async backup(bytes: Buffer, kind: string): Promise<void> {
    const directory = path.join(this.directory, "coding-action-backups");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${kind}-${Date.now()}-${randomUUID()}.json`), bytes, { flag: "wx" });
  }
  private async backupFile(file: string, kind: string): Promise<void> {
    const directory = path.join(this.directory, "coding-action-backups");
    await fs.mkdir(directory, { recursive: true });
    await fs.copyFile(file, path.join(directory, `${kind}-${Date.now()}-${randomUUID()}.json`), constants.COPYFILE_EXCL);
  }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }
  private async writeAtomic(configuration: CodingActionConfiguration): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = path.join(this.directory, `.coding-actions-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify(configuration, null, 2) + "\n", { flag: "wx", encoding: "utf8" });
      await fs.rename(temporary, this.file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
}
