import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { ShortcutStore } = await import("../electron/main/extensions/shortcut-store.ts");
const { configurationFromLegacyPrompts } = await import("../electron/main/extensions/shortcut-migration.ts");
const { resolveShortcutText, shortcutPreview } = await import("@pi-desktop/shared");
async function fixture(t) {
  const root = path.resolve(".pi-desktop-test", "shortcut-migration");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "case-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return new ShortcutStore(dir);
}
const legacy = { engineeringShortcutPrompts: { ask: null, discovery: "", review: "  保留原文\n审查  " }, secret: "must not enter backup" };
test("旧默认、空值及原文迁移后重启保持，备份能恢复来源", async t => {
  const store = await fixture(t);
  const config = await store.load(async () => legacy);
  assert.equal(config.migration.engineeringPrompts, true);
  const find = id => config.buttons.find(button => button.presetId === id);
  for (const language of ["zh-CN", "en"]) {
    const translate = key => `${language}:${key}`;
    assert.equal(resolveShortcutText(find("ask"), translate).prompt, `${language}:coding.prompts.ask`);
    assert.equal(shortcutPreview(find("discovery"), translate), "/grill-with-docs");
    assert.equal(resolveShortcutText(find("review"), translate).prompt, legacy.engineeringShortcutPrompts.review);
  }
  const backupDir = path.join(store.directory, "shortcut-migration-backups");
  const [file] = await fs.readdir(backupDir);
  const backup = JSON.parse(await fs.readFile(path.join(backupDir, file), "utf8"));
  assert.deepEqual(backup, { engineeringShortcutPrompts: legacy.engineeringShortcutPrompts });
  assert.deepEqual(configurationFromLegacyPrompts(backup), config);
  config.buttons[0].prompt = "new user edit";
  await store.save(config);
  assert.deepEqual(await new ShortcutStore(path.dirname(store.directory)).load(async () => { throw new Error("must not read legacy"); }), config);
  assert.equal(legacy.engineeringShortcutPrompts.ask, null);
});
test("源读取或备份失败不初始化，可重试；损坏新配置不重建", async t => {
  const store = await fixture(t);
  await assert.rejects(store.load(async () => { throw new Error("host unavailable"); }), /host unavailable/);
  assert.equal(await store.readExisting(), null);
  await fs.mkdir(store.directory, { recursive: true });
  const backupDir = path.join(store.directory, "shortcut-migration-backups");
  await fs.writeFile(backupDir, "blocked", "utf8");
  await assert.rejects(store.load(async () => legacy));
  assert.equal(await store.readExisting(), null);
  await fs.rm(backupDir);
  await store.load(async () => legacy);
  await fs.writeFile(store.file, "{broken", "utf8");
  await assert.rejects(store.load(async () => { assert.fail("must not read legacy"); }));
  assert.equal(await fs.readFile(store.file, "utf8"), "{broken");
});
test("迁移写入失败只留下来源备份，重试成功才持久化完成", async t => {
  const store = await fixture(t);
  await assert.rejects(store.load(async () => {
    await fs.mkdir(store.file, { recursive: true });
    return legacy;
  }));
  assert.ok((await fs.stat(store.file)).isDirectory());
  const backupDir = path.join(store.directory, "shortcut-migration-backups");
  assert.equal((await fs.readdir(backupDir)).length, 1);
  await fs.rmdir(store.file);
  const config = await store.load(async () => legacy);
  assert.equal(config.migration.engineeringPrompts, true);
  assert.deepEqual(await store.readExisting(), config);
});
test("无旧字段不虚构迁移备份，无效旧值保留待修复", async t => {
  const store = await fixture(t);
  await assert.rejects(store.load(async () => ({ engineeringShortcutPrompts: { review: 123 } })));
  assert.equal(await store.readExisting(), null);
  const config = await store.load(async () => ({}));
  assert.equal(config.migration, undefined);
  await assert.rejects(fs.stat(path.join(store.directory, "shortcut-migration-backups")), { code: "ENOENT" });
});
