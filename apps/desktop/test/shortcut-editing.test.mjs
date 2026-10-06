import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { createDefaultShortcutConfiguration, validateShortcutConfiguration } = await import("@pi-desktop/shared");
const { appendShortcut, copyShortcut, deleteShortcut, moveShortcut } = await import("../src/features/extensions/shortcut-editing.ts");
const { ShortcutStore } = await import("../electron/main/extensions/shortcut-store.ts");
const { promises: fs } = await import("node:fs");
const path = await import("node:path");

test("layout, hidden choices and same-skill prompt variants persist across restart", async t => {
  const root = path.resolve(".pi-desktop-test", "shortcut-editing");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, "case-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ShortcutStore(directory);
  let config = await store.load();
  const original = config.buttons[0];
  const copy = copyShortcut(original, "custom:variant", key => key);
  copy.prompt = "深入检查"; copy.position = "more"; copy.group = "collaboration";
  config = appendShortcut(config, copy);
  config.buttons[0] = { ...original, prompt: "快速检查", enabled: false };
  config = deleteShortcut(config, config.buttons.find(button => button.presetId === "discovery").id);
  await store.save(config);
  const restarted = await new ShortcutStore(directory).load();
  assert.deepEqual(restarted, config);
  assert.equal(restarted.buttons.find(button => button.id === copy.id).binding.skillId, original.binding.skillId);
  assert.equal(restarted.buttons[0].enabled, false);
  assert.equal(restarted.buttons.find(button => button.id === copy.id).prompt, "深入检查");
  assert.ok(restarted.deletedPresetIds.includes("discovery"));
});

test("copies materialize localized content with independent identity and binding", () => {
  const original = createDefaultShortcutConfiguration().buttons[0];
  const copy = copyShortcut(original, "custom:copy", key => key);
  assert.equal(copy.presetId, undefined);
  assert.notEqual(copy.id, original.id);
  copy.binding.skillId = "other";
  assert.notEqual(copy.binding.skillId, original.binding.skillId);
  assert.ok(copy.name.endsWith("副本"));
  const config = appendShortcut(createDefaultShortcutConfiguration(), copy);
  validateShortcutConfiguration(config);
});
test("ordering moves only within the visible position and group", () => {
  const config = createDefaultShortcutConfiguration();
  const primary = config.buttons.filter(button => button.position === "primary");
  assert.equal(moveShortcut(config, primary[0].id, -1), config);
  const moved = moveShortcut(config, primary[0].id, 1);
  assert.equal(moved.buttons.filter(button => button.position === "primary")[1].id, primary[0].id);
  assert.deepEqual(moved.buttons.filter(button => button.position === "more"), config.buttons.filter(button => button.position === "more"));
});
test("deleting presets tracks deletion choices and deleting everything permits new buttons", () => {
  let config = createDefaultShortcutConfiguration();
  const original = config.buttons[0];
  for (const button of config.buttons) config = deleteShortcut(config, button.id);
  assert.equal(config.buttons.length, 0);
  assert.equal(config.deletedPresetIds.length, 26);
  config = appendShortcut(config, copyShortcut(original, "custom:new", key => key));
  validateShortcutConfiguration(config);
  assert.equal(config.buttons.length, 1);
  assert.equal(deleteShortcut(config, "custom:new").deletedPresetIds.length, 26);
});
test("capacity errors preserve the original config", () => {
  let config = createDefaultShortcutConfiguration();
  const original = config.buttons[0];
  while (config.buttons.length < 256) config = appendShortcut(config, copyShortcut(original, `custom:${config.buttons.length}`, key => key));
  assert.throws(() => appendShortcut(config, copyShortcut(original, "custom:overflow", key => key)), /256/);
  assert.equal(config.buttons.length, 256);
});
