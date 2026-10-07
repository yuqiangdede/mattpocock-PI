import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { navigatorAnalysisInput, navigatorAnalysisCancelInput, parseNavigatorSuggestions } = await import("@pi-desktop/shared");
const { createNavigatorAnalysisController } = await import("../src/features/navigator/navigator-analysis-controller.ts");
const { catalogs } = await import("@pi-desktop/i18n");
const { loadNavigatorSkillAvailability } = await import("../src/features/navigator/navigator-skill-availability.ts");

test("导航消费Launcher有效catalog，保留plugin与bundled Skill并尊重禁用及遮蔽结果", async () => {
  const available = await loadNavigatorSkillAvailability(async () => ({ commands: [
    { name: "plugin-review", title: "Plugin review", kind: "skill", skillId: "plugin-review" },
    { name: "ask-matt", title: "Ask Matt", kind: "skill", skillId: "ask-matt" },
    { name: "shared-name", title: "Winning project Skill", kind: "skill", skillId: "project-winner" },
    { name: "disabled-skill", title: "Template shadows disabled Skill", kind: "template" },
    { name: "plugin-command", title: "Plugin command", kind: "plugin", skillId: "not-a-skill" },
  ] }));
  assert.deepEqual([...available], ["plugin-review", "ask-matt", "project-winner"]);
  assert.equal(available.has("disabled-skill"), false);
  assert.equal(available.has("global-shadowed"), false);
  await assert.rejects(loadNavigatorSkillAvailability(async () => { throw new Error("catalog unavailable"); }), /catalog unavailable/);
});

test("九个locale均具有一致的分析文案键与状态键", () => {
  const expected = Object.keys(catalogs.en.navigator.analysis).sort();
  for (const catalog of Object.values(catalogs)) {
    assert.deepEqual(Object.keys(catalog.navigator.analysis).sort(), expected);
    assert.deepEqual(Object.keys(catalog.navigator.analysis.status).sort(), Object.keys(catalogs.en.navigator.analysis.status).sort());
  }
});

test("分析合同只接受唯一证据 ID 和当前版本，生成内容只允许可用 Skill 建议", () => {
  const input = { sessionId: "s", activityId: "a", expectedVersion: 2, requestId: "r", selectedResultIds: ["f"] };
  assert.deepEqual(navigatorAnalysisInput(input), input);
  assert.deepEqual(navigatorAnalysisCancelInput(input), { sessionId: "s", activityId: "a", requestId: "r" });
  for (const requestId of ["", " ", "bad\0", null]) assert.throws(() => navigatorAnalysisCancelInput({ ...input, requestId }));
  for (const patch of [{ expectedVersion: 0 }, { requestId: "" }, { selectedResultIds: ["f", "f"] }, { selectedResultIds: ["../file\0"] }]) assert.throws(() => navigatorAnalysisInput({ ...input, ...patch }));
  const available = new Set(["to-spec"]);
  const valid = { suggestions: [{ skillId: "to-spec", reason: "固化已确认需求", basis: ["request:r"] }] };
  assert.deepEqual(parseNavigatorSuggestions(JSON.stringify(valid), available), valid.suggestions);
  assert.deepEqual(parseNavigatorSuggestions('{"suggestions":[]}', available), []);
  for (const value of ["not json", '{"suggestions":[{"skillId":"Write","reason":"run","basis":[]}]}', JSON.stringify({ suggestions: [{ ...valid.suggestions[0], command: "rm" }] }), JSON.stringify({ suggestions: Array(5).fill(valid.suggestions[0]) })]) assert.throws(() => parseNavigatorSuggestions(value, available));
});

test("工程活动结束后的公开接续路径：预览选择、手动请求、重复点击抑制、取消与重试保留历史", async () => {
  const old = { id: "old", status: "completed", suggestions: [{ skillId: "to-spec", reason: "固化", basis: [] }] };
  const calls = []; const pending = []; const updates = [];
  const controller = createNavigatorAnalysisController({
    async listNavigatorAnalyses(input) { calls.push({ kind: "list", input }); return { analyses: [old] }; },
    requestNavigatorAnalysis(input) { calls.push({ kind: "request", input }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
    async cancelNavigatorAnalysis(input) { calls.push({ kind: "cancel", input }); return { analyses: [{ id: "new", status: "cancelled" }, old] }; },
  }, state => updates.push(state));
  await controller.select({ sessionId: "s", activityId: "discussion" });
  assert.equal(calls.filter(c => c.kind === "request").length, 0);
  const request = controller.request(4, ["reply", "selected-file"]);
  await controller.request(4, ["other-file"]);
  assert.equal(calls.filter(c => c.kind === "request").length, 1);
  assert.deepEqual(calls[1].input.selectedResultIds, ["reply", "selected-file"]);
  await controller.cancel();
  assert.equal(calls[2].input.requestId, calls[1].input.requestId);
  assert.equal(updates.at(-1).snapshot.analyses[1], old);
  pending[0].reject(new Error("cancelled")); await request;
  assert.equal(updates.at(-1).pending, false);
  const retry = controller.request(4, ["reply"]);
  assert.notEqual(calls[3].input.requestId, calls[1].input.requestId);
  pending[1].reject(new Error("provider unavailable")); await retry;
  assert.equal(updates.at(-1).snapshot.analyses[1], old);
  assert.match(updates.at(-1).error, /provider unavailable/);
});

test("切换会话、卸载和迟到完成不能覆盖新会话或重新发起分析", async () => {
  const pending = []; const updates = [];
  const controller = createNavigatorAnalysisController({
    async listNavigatorAnalyses(input) { return { analyses: [{ id: input.sessionId }] }; },
    requestNavigatorAnalysis(input) { return new Promise(resolve => pending.push({ input, resolve })); },
    async cancelNavigatorAnalysis() { throw new Error("must not cancel another session"); },
  }, state => updates.push(state));
  await controller.select({ sessionId: "a", activityId: "one" });
  const request = controller.request(3, []);
  await controller.select({ sessionId: "b", activityId: "two" });
  pending[0].resolve({ analyses: [{ id: "late-a" }] }); await request;
  assert.equal(updates.at(-1).snapshot.analyses[0].id, "b");
  const second = controller.request(1, []); controller.dispose();
  const before = updates.length; pending[1].resolve({ analyses: [{ id: "late-b" }] }); await second;
  assert.equal(updates.length, before);
});

test("取消后立即重试，旧请求迟到的成功或错误不能覆盖新分析", async () => {
  const pending = []; const updates = [];
  const controller = createNavigatorAnalysisController({
    async listNavigatorAnalyses() { return { analyses: [] }; },
    requestNavigatorAnalysis(input) { return new Promise((resolve, reject) => pending.push({ input, resolve, reject })); },
    async cancelNavigatorAnalysis() { return { analyses: [{ id: "cancelled", status: "cancelled" }] }; },
  }, state => updates.push(state));
  await controller.select({ sessionId: "s", activityId: "a" });
  const first = controller.request(1, []);
  await controller.cancel();
  assert.equal(updates.at(-1).pending, false);
  const second = controller.request(1, []);
  pending[0].resolve({ analyses: [{ id: "obsolete", status: "completed" }] }); await first;
  assert.equal(updates.at(-1).pending, true);
  assert.equal(updates.at(-1).snapshot.analyses[0].id, "cancelled");
  pending[1].resolve({ analyses: [{ id: "latest", status: "completed" }] }); await second;
  assert.equal(updates.at(-1).snapshot.analyses[0].id, "latest");
});
