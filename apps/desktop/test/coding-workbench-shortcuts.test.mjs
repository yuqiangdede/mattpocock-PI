import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { createDefaultShortcutConfiguration, validateShortcutConfiguration, resolveShortcutText } = await import("@pi-desktop/shared");
const { zhCN } = await import("../../../packages/i18n/src/locales/zh-CN/index.ts");
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("default common shortcuts preserve the five frequent actions in order", () => {
  const config = createDefaultShortcutConfiguration();
  assert.deepEqual(config.buttons.filter(button => button.enabled && button.position === "primary").map(button => button.binding.skillId), [
    "ask-matt", "grill-with-docs", "implement", "diagnosing-bugs", "code-review",
  ]);
  assert.equal(config.buttons.length, 26);
  assert.equal(new Set(config.buttons.map(button => button.id)).size, 26);
});

test("More retains all remaining skills and moves specification and tickets into exploration", () => {
  const buttons = createDefaultShortcutConfiguration().buttons;
  const groups = Object.fromEntries(["exploration", "maintenance", "collaboration", "projectSetup"].map(group => [group, buttons.filter(button => button.position === "more" && button.group === group).map(button => button.binding.skillId)]));
  assert.deepEqual(groups.exploration, ["to-spec", "to-tickets", "grill-me", "grilling", "prototype", "research", "to-questionnaire"]);
  assert.deepEqual(new Set(groups.maintenance), new Set(["improve-codebase-architecture", "codebase-design", "domain-modeling", "tdd", "wayfinder", "triage", "resolving-merge-conflicts"]));
  assert.deepEqual(new Set(groups.collaboration), new Set(["retro", "handoff", "teach", "wait-what", "wizard", "writing-for-agents"]));
  assert.deepEqual(groups.projectSetup, ["setup-matt-pocock-skills"]);
  assert.equal(Object.values(groups).flat().length, 21);
});

test("fixed workflow and requirements operations are excluded from configurable skill identities", () => {
  const config = createDefaultShortcutConfiguration();
  assert.ok(config.buttons.every(button => !["workflow", "requirementsConfirmation"].includes(button.presetId)));
  config.buttons = [];
  // 允许全部快捷按钮被删除，固定操作的真实渲染和使用由 Electron 验证。
  assert.doesNotThrow(() => validateShortcutConfiguration(config));
});

test("preset labels and explicit customized text resolve through the public boundary", () => {
  const button = createDefaultShortcutConfiguration().buttons[0];
  const translate = key => key.split(".").reduce((value, part) => value?.[part], zhCN);
  assert.equal(resolveShortcutText(button, translate).name, "咨询下一步");
  assert.ok(resolveShortcutText(button, translate).note.includes(zhCN.coding.skillGuides.ask.example));
  Object.assign(button, { name: "快速咨询", prompt: "", note: "仅供自己查看" });
  assert.deepEqual(resolveShortcutText(button, () => "English default"), { name: "快速咨询", prompt: "", note: "仅供自己查看" });
});

test("shortcut rows wrap independently and use consistent regular text", async () => {
  const css = await read("../src/styles/coding-workbench.css");
  assert.match(css, /\.coding-shortcuts[^}]*flex-wrap: wrap/);
  assert.match(css, /\.coding-shortcuts \+ \.coding-shortcuts \{ margin-top: 6px; \}/);
  assert.match(css, /\.coding-shortcuts \.btn \{ font-weight: 400; \}/);
  assert.ok(!css.includes("font-weight: 700"));
});
