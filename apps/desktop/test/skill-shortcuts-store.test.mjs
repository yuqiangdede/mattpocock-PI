import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { ShortcutStore } = await import("../electron/main/extensions/shortcut-store.ts");
const { createDefaultShortcutConfiguration, validateShortcutConfiguration, resolveShortcutText } = await import("@pi-desktop/shared");
const root = path.resolve(".pi-desktop-test", "shortcut-store");
async function fixture(t) {
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "case-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return new ShortcutStore(dir);
}
test("initialization, restart, overrides and recoverable backup", async t => {
  const store = await fixture(t);
  assert.equal(await store.readExisting(), null);
  const initial = await store.load();
  assert.equal(initial.buttons.length, 26);
  assert.equal(initial.buttons.find(b => b.presetId === "spec").position, "more");
  const next = structuredClone(initial);
  Object.assign(next.buttons[0], { name: "自定义按钮", prompt: "", note: "仅备注" });
  await store.save(next);
  assert.deepEqual(await new ShortcutStore(path.dirname(store.directory)).load(), next);
  const backups = await fs.readdir(path.join(store.directory, "shortcut-backups"));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(store.directory, "shortcut-backups", backups[0]), "utf8")), initial);
  assert.deepEqual(resolveShortcutText(next.buttons[0], k => `EN:${k}`), { name: "自定义按钮", prompt: "", note: "仅备注" });
  assert.match(resolveShortcutText(initial.buttons[0], k => `ZH:${k}`).name, /^ZH:/);
});
test("corrupt or unreadable existing config is not initialized or overwritten", async t => {
  const store = await fixture(t);
  await fs.mkdir(store.directory, { recursive: true });
  await fs.writeFile(store.file, "{broken", "utf8");
  await assert.rejects(store.load());
  await assert.rejects(store.save(createDefaultShortcutConfiguration()));
  assert.equal(await fs.readFile(store.file, "utf8"), "{broken");
  await fs.rm(store.file);
  await fs.mkdir(store.file);
  await assert.rejects(store.load());
  assert.ok((await fs.stat(store.file)).isDirectory());
});
test("backup failure preserves valid current config", async t => {
  const store = await fixture(t);
  const initial = await store.load();
  await fs.writeFile(path.join(store.directory, "shortcut-backups"), "blocked", "utf8");
  const next = structuredClone(initial); next.buttons[0].prompt = "changed";
  await assert.rejects(store.save(next));
  assert.deepEqual(await store.readExisting(), initial);
});
test("invalid and duplicate identities rejected at storage boundary", async t => {
  const store = await fixture(t);
  const initial = await store.load();
  const invalid = structuredClone(initial); invalid.buttons.push(invalid.buttons[0]);
  assert.throws(() => validateShortcutConfiguration(invalid));
  await assert.rejects(store.save(invalid));
  assert.deepEqual(await store.readExisting(), initial);
});

test("single preset reset preserves layout and removes localized overrides", async () => {
  const { restoreShortcutPreset } = await import("@pi-desktop/shared");
  const original = createDefaultShortcutConfiguration().buttons[0];
  const changed = { ...original, name: "改名", prompt: "", note: "说明", binding: { skillId: "other" }, position: "more", enabled: false };
  const reset = restoreShortcutPreset(changed);
  assert.equal(reset.position, "more"); assert.equal(reset.enabled, false);
  assert.equal(reset.name, undefined); assert.equal(reset.prompt, undefined); assert.equal(reset.note, undefined);
  assert.deepEqual(reset.binding, original.binding);
  assert.throws(() => restoreShortcutPreset({ ...changed, presetId: undefined }));
});
test("explicit default and backup recovery preserve corrupt original bytes and restart", async t => {
  const store = await fixture(t);
  const initial = await store.load();
  const changed = structuredClone(initial); changed.buttons[0].prompt = "我的提示词";
  changed.deletedPresetIds = ["review"];
  await store.save(changed);
  await store.restore();
  const backups = await store.listBackups();
  const changedBackup = (await Promise.all(backups.map(async id => ({ id, value: JSON.parse(await fs.readFile(path.join(store.directory, "shortcut-backups", id), "utf8")) })))).find(item => item.value.buttons[0].prompt === "我的提示词").id;
  const corrupt = Buffer.from([0xff, 0x00, 0x7b]); await fs.writeFile(store.file, corrupt);
  await store.restore(changedBackup);
  assert.deepEqual(await new ShortcutStore(path.dirname(store.directory)).load(), changed);
  const entries = await fs.readdir(path.join(store.directory, "shortcut-backups"));
  assert.ok((await Promise.all(entries.map(id => fs.readFile(path.join(store.directory, "shortcut-backups", id))))).some(bytes => bytes.equals(corrupt)));
  await assert.rejects(store.restore("../bad.json"));
  assert.deepEqual(await store.readExisting(), changed);
});
test("invalid backup, backup failure and atomic write failure do not replace current config", async t => {
  const store = await fixture(t); const initial = await store.load();
  const backups = path.join(store.directory, "shortcut-backups"); await fs.mkdir(backups);
  await fs.writeFile(path.join(backups, "123-abcd.json"), "broken");
  assert.deepEqual(await store.listBackups(), []);
  await assert.rejects(store.restore("123-abcd.json")); assert.deepEqual(await store.readExisting(), initial);
  const originalWrite = store.writeAtomic; store.writeAtomic = async () => { throw new Error("write failure"); };
  await assert.rejects(store.restore()); assert.deepEqual(await store.readExisting(), initial); store.writeAtomic = originalWrite;
  await fs.rm(backups, { recursive: true }); await fs.writeFile(backups, "blocked");
  await assert.rejects(store.restore()); assert.deepEqual(await store.readExisting(), initial);
});

test("migration source backup can be validated and restored", async t => {
  const store = await fixture(t); await store.load();
  const directory = path.join(store.directory, "shortcut-migration-backups"); await fs.mkdir(directory);
  const ENGINEERING_SHORTCUT_ACTIONS = createDefaultShortcutConfiguration().buttons.map(item => item.presetId);
  const prompts = Object.fromEntries(ENGINEERING_SHORTCUT_ACTIONS.map(id => [id, null])); prompts.ask = "迁移来源提示词";
  await fs.writeFile(path.join(directory, "123-abcd.json"), JSON.stringify({ engineeringShortcutPrompts: prompts }));
  assert.ok((await store.listBackups()).includes("migration:123-abcd.json"));
  const restored = await store.restore("migration:123-abcd.json");
  assert.equal(restored.buttons.find(item => item.presetId === "ask").prompt, "迁移来源提示词");
  assert.equal(restored.migration.engineeringPrompts, true);
});
