import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { ShortcutStore } = await import("../electron/main/extensions/shortcut-store.ts");
const { exportShortcutConfiguration, parseShortcutImport, confirmShortcutImport } = await import("../src/features/extensions/shortcut-transfer.ts");
const { resolveShortcutBinding, resolveShortcutText, shortcutPreview } = await import("@pi-desktop/shared");
async function stores(t) {
  const root = path.resolve(".pi-desktop-test", "shortcut-transfer");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "case-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return [new ShortcutStore(path.join(dir, "machine-a")), new ShortcutStore(path.join(dir, "machine-b"))];
}
test("JSON transfers complete semantics between isolated data directories and restart", async t => {
  const [source, target] = await stores(t);
  const config = await source.load();
  Object.assign(config.buttons[0], { name: "自定义", prompt: "", note: "只显示", position: "more", enabled: false });
  config.buttons.push({ id: "custom:test", name: "项目技能", prompt: "处理问题", note: "备注", position: "primary", group: "maintenance", enabled: true, binding: { skillId: "my-skill", source: "user", sourceId: "project" } });
  config.buttons = config.buttons.filter(button => button.presetId !== "review"); config.deletedPresetIds = ["review"];
  await source.save(config);
  const exported = exportShortcutConfiguration(await source.load());
  assert.equal(exported.includes(source.directory), false);
  const incoming = parseShortcutImport("\uFEFF" + exported);
  const old = await target.load();
  await confirmShortcutImport(incoming, true, value => target.save(value));
  const restarted = await new ShortcutStore(path.dirname(target.directory)).load();
  assert.deepEqual(restarted, config);
  const backups = await target.listBackups(); assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target.directory, "shortcut-backups", backups[0]), "utf8")), old);
  assert.equal(resolveShortcutText(restarted.buttons[0], key => `EN:${key}`).prompt, "");
  assert.equal(restarted.buttons[1].prompt, undefined);
  assert.match(resolveShortcutText(restarted.buttons[1], key => `EN:${key}`).prompt, /^EN:/);
  assert.equal(shortcutPreview(restarted.buttons.at(-1), key => key), shortcutPreview(config.buttons.at(-1), key => key));
  assert.throws(() => resolveShortcutBinding(restarted.buttons.at(-1).binding, []), /不可用/);
});
test("invalid imports and cancellation leave persisted configuration unchanged", async t => {
  const [, target] = await stores(t); const old = await target.load();
  const incoming = structuredClone(old); incoming.buttons[0].prompt = "替换";
  let calls = 0;
  assert.equal(await confirmShortcutImport(incoming, false, async () => { calls++; throw new Error(); }), null);
  assert.equal(calls, 0);
  for (const text of ["{bad", JSON.stringify({ ...incoming, schemaVersion: 2 }), JSON.stringify({ ...incoming, buttons: [...incoming.buttons, incoming.buttons[0]] })]) assert.throws(() => parseShortcutImport(text));
  assert.deepEqual(await target.load(), old); assert.deepEqual(await target.listBackups(), []);
});
test("failed backup and corrupt existing file preserve original and retry payload", async t => {
  const [, target] = await stores(t); const old = await target.load();
  const incoming = structuredClone(old); incoming.buttons[0].prompt = "重试内容";
  const payload = exportShortcutConfiguration(incoming);
  const backupDir = path.join(target.directory, "shortcut-backups");
  await fs.writeFile(backupDir, "blocked", "utf8");
  await assert.rejects(confirmShortcutImport(incoming, true, value => target.save(value)));
  assert.deepEqual(await target.load(), old); assert.equal(exportShortcutConfiguration(incoming), payload);
  await fs.rm(backupDir);
  await confirmShortcutImport(incoming, true, value => target.save(value));
  assert.deepEqual(await target.load(), incoming);
  await fs.writeFile(target.file, "{corrupt", "utf8");
  await assert.rejects(confirmShortcutImport(old, true, value => target.save(value)));
  assert.equal(await fs.readFile(target.file, "utf8"), "{corrupt");
});

test("atomic replacement failure preserves current config and import payload", async t => {
  const [, target] = await stores(t); const old = await target.load();
  const incoming = structuredClone(old); incoming.buttons[0].prompt = "写入失败后重试";
  const originalRename = fs.rename;
  // 在实际文件替换边界注入受控失败，不触碰用户数据。
  fs.rename = async (from, to) => { if (to === target.file) throw new Error("受控写入失败"); return originalRename(from, to); };
  try { await assert.rejects(confirmShortcutImport(incoming, true, value => target.save(value)), /受控写入失败/); }
  finally { fs.rename = originalRename; }
  assert.deepEqual(await target.load(), old);
  assert.equal(incoming.buttons[0].prompt, "写入失败后重试");
  assert.equal((await target.listBackups()).length, 1);
  assert.equal((await fs.readdir(target.directory)).some(name => name.endsWith(".tmp")), false);
  await confirmShortcutImport(incoming, true, value => target.save(value));
  assert.deepEqual(await target.load(), incoming);
});
