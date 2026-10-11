import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const shared = await import("@pi-desktop/shared");
const { CodingActionStore } = await import("../electron/main/extensions/coding-action-store.ts");
const { preparePromptAction } = await import("../src/features/coding/prepare-prompt-action.ts");

test("plain prompt button names and instructions survive save, restart and Skill reordering", async t => {
  const directory = await mkdtemp(join(tmpdir(), "pi-prompt-actions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new CodingActionStore(directory);
  const configuration = shared.createDefaultCodingActions();
  configuration.promptActions = [
    { id: "commit-code", label: "Verify and commit", prompt: "Build first, then commit with SVN or Git.", order: 1 },
    { id: "summarize", label: "Summarize changes", prompt: "Summarize the current changes.", enabled: false, order: 0 },
  ];
  await store.save(configuration);
  const restarted = await new CodingActionStore(directory).load();
  assert.equal(restarted.recoveryRequired, undefined);
  assert.deepEqual(restarted.configuration, configuration);
  const moved = shared.moveCodingAction(restarted.configuration, "code-review", -1);
  assert.deepEqual(moved.promptActions, configuration.promptActions);
  assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")).promptActions, configuration.promptActions);
});

test("legacy defaults do not rewrite saved files, and explicit empty lists remain empty", async t => {
  const directory = await mkdtemp(join(tmpdir(), "pi-prompt-legacy-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new CodingActionStore(directory);
  const original = (await store.load()).configuration;
  const bytes = await readFile(store.file);
  assert.deepEqual(shared.codingPromptActions(original, "Localized commit"), [{ id: "commit-code", label: "Localized commit", prompt: null, order: 0 }]);
  assert.equal(shared.resolveCodingPromptAction(original, "commit-code", "Localized instructions").prompt, "Localized instructions");
  assert.deepEqual(await readFile(store.file), bytes);
  await store.save({ ...original, promptActions: [] });
  assert.deepEqual(shared.codingPromptActions((await new CodingActionStore(directory).load()).configuration), []);
  await store.reset();
  assert.equal(shared.codingPromptActions((await store.load()).configuration).length, 1);
});

test("prompt configuration validates the native boundary without accepting Skill bindings", () => {
  const valid = { id: "custom", label: "Custom", prompt: "Keep exact text" };
  for (const patch of [
    { id: "" }, { id: "duplicate\0" }, { label: " " }, { label: "a".repeat(129) },
    { prompt: "" }, { prompt: "a".repeat(16001) }, { prompt: null }, { prompt: "bad\0text" },
    { enabled: "yes" }, { order: -1 }, { order: 1.5 }, { skillId: "code-review" },
  ]) assert.throws(() => shared.validateCodingActions({ schemaVersion: 1, actions: [], promptActions: [{ ...valid, ...patch }] }));
  for (const entries of [null, {}, [valid, valid], Array.from({ length: 257 }, (_, index) => ({ ...valid, id: String(index) }))]) {
    assert.throws(() => shared.validateCodingActions({ schemaVersion: 1, actions: [], promptActions: entries }));
  }
});

test("plain selection uses saved custom text and rejects disabled or removed buttons before editing", () => {
  const configuration = { schemaVersion: 1, actions: [], promptActions: [
    { id: "commit-code", label: "Verify", prompt: "Custom Git/SVN checks", order: 2 },
    { id: "summary", label: "Summary", prompt: "Summarize", enabled: false, order: 0 },
  ] };
  let draft = "  Keep the draft\nfile \uFFFC\n ", applies = 0;
  const options = { configuration, commitPrompt: "Default", readLiveDraft: () => draft, applyDraft: value => { draft = value; applies++; } };
  preparePromptAction("commit-code", options);
  assert.equal(draft, "Custom Git/SVN checks\n\n  Keep the draft\nfile \uFFFC\n ");
  assert.deepEqual(shared.codingPromptActions(configuration).map(item => item.id), ["summary", "commit-code"]);
  for (const id of ["summary", "deleted"]) assert.throws(() => preparePromptAction(id, options));
  assert.equal(applies, 1);
});
