import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { navigatorSuggestionContext } = await import("../src/features/navigator/navigator-suggestion-draft.ts");
const { prepareComposer, registerComposerPreparation } = await import("../src/features/coding/composer-preparation-bridge.ts");
const { executeCodingAction } = await import("../src/features/coding/execute-coding-action.ts");
const { catalogs } = await import("@pi-desktop/i18n");

const suggestion = { skillId: "to-spec", reason: "Capture the agreed requirements", basis: ["model reference is not authoritative"] };
const analysis = { id: "analysis-a", activityId: "activity-a", provenance: { evidence: [
  { id: "reply", kind: "reply", sourceMessageId: "message-a", content: "ENTIRE PRIVATE CONVERSATION" },
  { id: "file", kind: "file", path: "docs/requirements.md", content: "FULL FILE BODY" },
  { id: "validation", kind: "verification", label: "tests passed" },
] } };

test("建议接续仅携带分析快照引用与可编辑摘要，不拷正文或相信模型依据", () => {
  const prompt = navigatorSuggestionContext(analysis, suggestion, catalogs.en.navigator.draft);
  assert.match(prompt, /Capture the agreed requirements/);
  assert.match(prompt, /activity:activity-a analysis:analysis-a/);
  assert.match(prompt, /message:message-a/);
  assert.match(prompt, /docs\/requirements.md/);
  assert.match(prompt, /result:validation/);
  assert.match(prompt, /not claimed to be read or current/);
  assert.doesNotMatch(prompt, /ENTIRE PRIVATE|FULL FILE|model reference/);
  assert.doesNotThrow(() => navigatorSuggestionContext({ ...analysis, provenance: { evidence: [null, "bad", {}] } }, suggestion, catalogs.en.navigator.draft));
  for (const catalog of Object.values(catalogs)) assert.deepEqual(Object.keys(catalog.navigator.draft).sort(), Object.keys(catalogs.en.navigator.draft).sort());
});

test("建议通过Composer公共准备入口复用Launcher，保留最新文字附件，只手动Send执行", async () => {
  const references = [{ token: "@attached", path: "existing.txt" }];
  const images = [{ name: "existing.png" }];
  let live = "Existing user text"; let calls = 0; let applied;
  let releaseCatalog;
  const unregister = registerComposerPreparation(async request => {
    if (request.sessionId !== "s" || request.projectPath !== "project") return false;
    await executeCodingAction("suggested", {
      sessionId: "s", projectPath: "project",
      configuration: { schemaVersion: 1, actions: [{ id: "suggested", label: "Spec", skillId: request.skillId, prompt: request.prompt }] },
      catalog: () => new Promise(resolve => { calls++; releaseCatalog = resolve; }), isCurrent: () => true,
      defaultPrompt: () => "", readLiveDraft: () => live,
      applyDraft: text => { applied = { text, references, images }; },
    });
    return true;
  });
  try {
    assert.equal(await prepareComposer({ sessionId: "other", projectPath: "project", ...suggestion, prompt: "" }), false);
    const pending = prepareComposer({ sessionId: "s", projectPath: "project", skillId: "to-spec", prompt: navigatorSuggestionContext(analysis, suggestion, catalogs.en.navigator.draft) });
    live += " typed while loading";
    releaseCatalog([{ name: "project-spec", title: "Spec", kind: "skill", skillId: "to-spec" }]);
    assert.equal(await pending, true);
    assert.equal(calls, 1);
    assert.match(applied.text, /^\/project-spec /);
    assert.ok(applied.text.endsWith(live));
    assert.equal(applied.references, references); assert.equal(applied.images, images);
  } finally { unregister(); }
  assert.equal(await prepareComposer({ sessionId: "s", projectPath: "project", skillId: "to-spec", prompt: "" }), false);
});

test("迟到Catalog和Skill禁用不修改草稿；旧Composer卸载不移除新所有者", async () => {
  let current = true; let writes = 0; let resolveCatalog;
  const context = { sessionId: "s", projectPath: "project", configuration: { schemaVersion: 1, actions: [{ id: "a", label: "Spec", skillId: "to-spec" }] },
    catalog: () => new Promise(resolve => { resolveCatalog = resolve; }), isCurrent: () => current,
    defaultPrompt: () => "", readLiveDraft: () => "keep", applyDraft: () => writes++ };
  const pending = executeCodingAction("a", context); current = false;
  resolveCatalog([{ name: "to-spec", title: "Spec", kind: "skill", skillId: "to-spec" }]);
  await assert.rejects(pending, /切换/); assert.equal(writes, 0);
  current = true;
  await assert.rejects(executeCodingAction("a", { ...context, catalog: async () => [] }), /Skill missing/);
  assert.equal(writes, 0);
  const old = registerComposerPreparation(async () => false);
  const next = registerComposerPreparation(async () => true);
  old(); assert.equal(await prepareComposer({}), true);
  next(); assert.equal(await prepareComposer({}), false);
});
