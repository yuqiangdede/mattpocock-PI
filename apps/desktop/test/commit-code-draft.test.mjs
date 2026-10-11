import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { buildCommitCodeDraft } = await import("../src/features/coding/commit-code-draft.ts");
const { en } = await import("../../../packages/i18n/src/locales/en/index.ts");
const { zhCN } = await import("../../../packages/i18n/src/locales/zh-CN/index.ts");

test("Commit code is a plain editable prompt without a Skill marker", () => {
  for (const catalog of [en, zhCN]) {
    const prompt = catalog.codingActions.commitPrompt;
    assert.ok(prompt.length > 50);
    assert.equal(buildCommitCodeDraft(prompt, ""), prompt);
    assert.ok(!buildCommitCodeDraft(prompt, "").startsWith("/"));
  }
});
test("Commit code preserves existing text, whitespace and attachment tokens", () => {
  const existing = "  investigate this\nfile \uFFFC\n ";
  const prompt = zhCN.codingActions.commitPrompt;
  assert.equal(buildCommitCodeDraft(prompt, existing), prompt + "\n\n" + existing);
  assert.equal(buildCommitCodeDraft(prompt, buildCommitCodeDraft(prompt, existing)), prompt + "\n\n" + prompt + "\n\n" + existing);
});
test("Localized commit instructions require successful verification and support GitLab and SVN", () => {
  assert.match(zhCN.codingActions.commitPrompt, /GitLab\/SVN/);
  assert.match(zhCN.codingActions.commitPrompt, /编译/);
  assert.match(zhCN.codingActions.commitPrompt, /验证通过后/);
  assert.match(zhCN.codingActions.commitPrompt, /不执行 Push/);
  assert.match(en.codingActions.commitPrompt, /GitLab/);
  assert.match(en.codingActions.commitPrompt, /SVN/);
});
