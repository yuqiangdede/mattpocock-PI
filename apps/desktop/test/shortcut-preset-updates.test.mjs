import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { createDefaultShortcutConfiguration, getShortcutPresetUpdates, applyShortcutPresetUpdates, validateShortcutConfiguration } = await import("@pi-desktop/shared");
const { ShortcutStore } = await import("../electron/main/extensions/shortcut-store.ts");
const { configurationFromLegacyPrompts } = await import("../electron/main/extensions/shortcut-migration.ts");
const { deleteShortcut } = await import("../src/features/extensions/shortcut-editing.ts");

test("实际发货的所有语言预置内容和绑定与基线一致", () => {
  execFileSync(process.execPath, ["scripts/shortcut-preset-manifest.mjs", "--check"], { cwd: new URL("../../../", import.meta.url), stdio: "pipe" });
});

test("版本变化不覆盖配置，只有内容变化产生对应通知", () => {
  const config = createDefaultShortcutConfiguration();
  const defaults = structuredClone(config);
  defaults.presetVersion++;
  assert.deepEqual(getShortcutPresetUpdates(config, defaults), []);
  defaults.presetBaseline.ask = "new-skill-content";
  assert.deepEqual(getShortcutPresetUpdates(config, defaults), [{ presetId: "ask", kind: "changed" }]);
  const before = structuredClone(config);
  getShortcutPresetUpdates(config, defaults);
  assert.deepEqual(config, before);
});

test("选择只恢复对应四字段并保留布局，未选变化和自建按钮保持", () => {
  const config = createDefaultShortcutConfiguration();
  const defaults = structuredClone(config);
  defaults.presetBaseline.ask = "ask-v2";
  defaults.presetBaseline.review = "review-v2";
  defaults.buttons.find(button => button.presetId === "ask").binding.skillId = "new-ask";
  const index = config.buttons.findIndex(button => button.presetId === "ask");
  config.buttons[index] = { ...config.buttons[index], name: "我的按钮", prompt: "", note: "备注", binding: { skillId: "mine" }, position: "more", group: "collaboration", enabled: false };
  config.buttons.push({ id: "custom:mine", name: "自建", binding: { skillId: "mine" }, position: "primary", group: "maintenance", enabled: true });
  const before = structuredClone(config);
  const result = applyShortcutPresetUpdates(config, ["ask"], defaults);
  assert.deepEqual(config, before);
  assert.deepEqual(result.buttons[index], { id: before.buttons[index].id, presetId: "ask", binding: { skillId: "new-ask" }, position: "more", group: "collaboration", enabled: false });
  assert.deepEqual(result.buttons.filter(button => button.presetId !== "ask"), before.buttons.filter(button => button.presetId !== "ask"));
  assert.deepEqual(getShortcutPresetUpdates(result, defaults), [{ presetId: "review", kind: "changed" }]);
});

test("删除预置在更新后仍保持删除，只有明确选择才追加且不重排", () => {
  const config = deleteShortcut(createDefaultShortcutConfiguration(), "matt:ask");
  assert.deepEqual(getShortcutPresetUpdates(config), []);
  const defaults = createDefaultShortcutConfiguration();
  defaults.presetBaseline.ask = "v2";
  assert.deepEqual(getShortcutPresetUpdates(config, defaults), [{ presetId: "ask", kind: "deleted" }]);
  assert.ok(config.deletedPresetIds.includes("ask"));
  const result = applyShortcutPresetUpdates(config, ["ask"], defaults);
  assert.deepEqual(result.buttons.slice(0, -1), config.buttons);
  assert.equal(result.buttons.at(-1).presetId, "ask");
  assert.ok(!result.deletedPresetIds.includes("ask"));
});

test("迁移与旧导入配置保留用户数据，缺少基线明确提示核对", () => {
  const migrated = configurationFromLegacyPrompts({ engineeringShortcutPrompts: { ask: "保留旧提示词" } });
  const defaults = createDefaultShortcutConfiguration();
  defaults.presetBaseline.ask = "v2";
  const before = structuredClone(migrated);
  getShortcutPresetUpdates(migrated, defaults);
  assert.deepEqual(migrated, before);
  delete migrated.presetBaseline;
  validateShortcutConfiguration(migrated);
  assert.ok(getShortcutPresetUpdates(migrated).every(update => update.kind === "untracked"));
  assert.equal(migrated.buttons.find(button => button.presetId === "ask").prompt, "保留旧提示词");
});

test("采用预置通过真实配置保存备份，重启后通知只保留未选内容", async t => {
  const root = path.resolve(".pi-desktop-test", "shortcut-preset-updates");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, "case-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ShortcutStore(directory);
  const initial = await store.load();
  const defaults = structuredClone(initial);
  defaults.presetBaseline.ask = "v2";
  defaults.presetBaseline.review = "v2";
  const next = applyShortcutPresetUpdates(initial, ["ask"], defaults);
  await store.save(next);
  const reloaded = await new ShortcutStore(directory).load();
  assert.deepEqual(reloaded, next);
  assert.deepEqual(getShortcutPresetUpdates(reloaded, defaults), [{ presetId: "review", kind: "changed" }]);
  const backups = await store.listBackups();
  assert.equal(backups.length, 1);
  const restored = await store.restore(backups[0]);
  assert.deepEqual(restored, initial);
});

test("超容量采用和错误基线不会覆盖原配置", () => {
  const config = deleteShortcut(createDefaultShortcutConfiguration(), "matt:ask");
  while (config.buttons.length < 256) config.buttons.push({ id: `custom:${config.buttons.length}`, name: "自建", binding: { skillId: "mine" }, position: "more", group: "maintenance", enabled: true });
  const defaults = createDefaultShortcutConfiguration();
  defaults.presetBaseline.ask = "v2";
  const before = structuredClone(config);
  assert.throws(() => applyShortcutPresetUpdates(config, ["ask"], defaults));
  assert.deepEqual(config, before);
  assert.throws(() => validateShortcutConfiguration({ ...config, presetBaseline: { ask: 123 } }));
});
