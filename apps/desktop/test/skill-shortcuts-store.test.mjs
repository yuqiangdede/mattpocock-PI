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
