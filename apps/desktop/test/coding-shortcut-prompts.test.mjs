import assert from "node:assert/strict";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { buildSkillShortcutDraft } = await import("../src/features/chat/composer/skill-shortcut-draft.ts");
const { en } = await import("../../../packages/i18n/src/locales/en/index.ts");
const { zhCN } = await import("../../../packages/i18n/src/locales/zh-CN/index.ts");
const source = await readFile(new URL("../../../packages/shared/src/engineering-shortcuts.ts", import.meta.url), "utf8");
const actions = [...new Set(["ask", ...[...source.matchAll(/\{ action: "([^"]+)", skill: "([^"]+)" \}/g)].map(match => match[1])])];

test("every visible and More skill has a localized nonempty default instruction", () => {
  assert.equal(actions.length, 26);
  for (const action of actions) {
    for (const catalog of [en, zhCN]) {
      assert.ok(catalog.coding.prompts[action]?.trim(), `Missing prompt: ${action}`);
      assert.ok(!catalog.coding.prompts[action].includes("\uFFFD"), `Invalid encoding: ${action}`);
    }
  }
});

test("empty draft receives the resolved skill marker and editable instruction", () => {
  assert.equal(buildSkillShortcutDraft("custom-ask", zhCN.coding.prompts.ask, ""), `/custom-ask ${zhCN.coding.prompts.ask}`);
});

test("default instruction preserves existing text, whitespace and file tokens verbatim", () => {
  const existing = "  /existing request\nfile \uFFFC\n ";
  assert.equal(buildSkillShortcutDraft("implement", en.coding.prompts.implement, existing), `/implement ${en.coding.prompts.implement}\n\n${existing}`);
});

test("repeated selections preserve the previous instruction and user draft", () => {
  const first = buildSkillShortcutDraft("implement", en.coding.prompts.implement, "My request");
  assert.equal(buildSkillShortcutDraft("code-review", en.coding.prompts.review, first), `/code-review ${en.coding.prompts.review}\n\n${first}`);
});


test("explicit empty instruction inserts only the skill and preserves live text", () => {
  assert.equal(buildSkillShortcutDraft("ask-matt", "", ""), "/ask-matt ");
  assert.equal(buildSkillShortcutDraft("ask-matt", "", "My request"), "/ask-matt My request");
});
