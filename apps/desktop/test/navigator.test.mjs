import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { findSkillMentions } = await import("@pi-desktop/shared");
const { createNavigatorReader } = await import("../src/features/navigator/navigator-reader.ts");
const { createNavigatorHistory } = await import("../src/features/navigator/navigator-history.ts");
const { navigatorVisibilityInput } = await import("@pi-desktop/shared");
const { registerNavigatorIpc } = await import("../electron/main/ipc/navigator-ipc.ts");
const { IPC } = await import("@pi-desktop/shared");

test("隐藏恢复通过公共 IPC 转发 Host，非法输入不能触及存储", async () => {
  const handlers = new Map(); const calls = [];
  registerNavigatorIpc({ handle(channel, fn) { handlers.set(channel, fn); } }, () => ({ call(method, input) { calls.push({ method, input }); return Promise.resolve({ ok: true }); } }));
  const hide = handlers.get(IPC.invoke.navigatorSetHidden);
  await hide({ sessionId: "a", activityId: "one", hidden: true });
  await hide({ sessionId: "a", activityId: "one", hidden: false });
  assert.deepEqual(calls.map(call => call.input.hidden), [true, false]);
  assert.ok(calls.every(call => call.method === "navigator.setHidden"));
  await assert.rejects(hide({ sessionId: "a", activityId: "one", hidden: "yes" }));
  assert.equal(calls.length, 2);
});

test("历史入口隐藏与恢复同一活动，重复点击、切换和删除后的失败不串会话", async () => {
  const activities = [{ id: "one", hidden: false, endedAt: null, version: 1 }];
  const writes = []; let refreshed = 0; const failures = [];
  const history = createNavigatorHistory((session, id, hidden) => new Promise((resolve, reject) => writes.push({ session, id, hidden, resolve, reject })), () => refreshed++, error => failures.push(error));
  history.select("a"); const hide = history.setHidden("one", true);
  await history.setHidden("one", true); assert.equal(writes.length, 1);
  activities[0].hidden = writes[0].hidden; writes[0].resolve({ ok: true }); await hide;
  assert.equal(refreshed, 1); assert.equal(activities.filter(item => !item.hidden).length, 0);
  const restore = history.setHidden("one", false); activities[0].hidden = writes[1].hidden; writes[1].resolve({ ok: true }); await restore;
  assert.equal(activities.filter(item => !item.hidden).length, 1); assert.equal(activities[0].endedAt, null); assert.equal(activities[0].version, 1);
  const stale = history.setHidden("one", true); history.select("b"); writes[2].reject(new Error("activity not found")); await stale;
  assert.equal(refreshed, 2); assert.deepEqual(failures, []);
  const deleted = history.setHidden("deleted", false); writes[3].reject(new Error("activity not found")); await deleted;
  assert.match(failures[0], /activity not found/); history.dispose();
  assert.deepEqual(navigatorVisibilityInput({ sessionId: "a", activityId: "one", hidden: false }), { sessionId: "a", activityId: "one", hidden: false });
  assert.throws(() => navigatorVisibilityInput({ sessionId: "a", activityId: "one", hidden: "false" }));
});

test("实际发送的按钮草稿与手动 slash 共用 Skill 解析，删除 marker 后不创建请求", () => {
  const installed = new Map([["to-spec", "to-spec"], ["code-review", "code-review"]]);
  assert.deepEqual(findSkillMentions("/to-spec 固化需求", installed).map(item => item.id), ["to-spec"]);
  assert.deepEqual(findSkillMentions("/to-spec /code-review inspect", installed).map(item => item.id), ["to-spec", "code-review"]);
  assert.deepEqual(findSkillMentions("固化需求", installed), []);
  assert.deepEqual(findSkillMentions("/unknown discuss", installed), []);
});

test("导航读取在会话切换、重复刷新和卸载后忽略过期结果，不启动执行", async () => {
  const pending = [];
  const published = [];
  const reader = createNavigatorReader(sessionId => new Promise(resolve => pending.push({ sessionId, resolve })), (snapshot, error) => published.push({ snapshot, error }));
  reader.select("a"); const first = reader.refresh();
  reader.select("b"); const second = reader.refresh();
  pending[0].resolve({ activities: [{ sessionId: "a" }], unavailableCount: 0 }); await first;
  assert.equal(published.at(-1).snapshot, null);
  pending[1].resolve({ activities: [{ sessionId: "b" }], unavailableCount: 0 }); await second;
  assert.equal(published.at(-1).snapshot.activities[0].sessionId, "b");
  const third = reader.refresh(); reader.dispose();
  pending[2].resolve({ activities: [], unavailableCount: 0 }); await third;
  assert.equal(published.at(-1).snapshot.activities[0].sessionId, "b");
});

test("导航呈现真实请求与逐个 Skill 使用证据，不把终态当作批准", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), cacheDir: fileURLToPath(new URL("../../../cache/navigator-ssr", import.meta.url)),
    configFile: false, logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)), "@pi-desktop/i18n": fileURLToPath(new URL("../../../packages/i18n/src/index.ts", import.meta.url)) } },
  });
  t.after(() => server.close());
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  let executions = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {}, piDesktop: { on: () => () => {}, invoke: () => { executions++; throw new Error("Rendering cannot execute"); } } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, "window", original); else delete globalThis.window; });
  const { NavigatorView } = await server.ssrLoadModule("/src/features/navigator/NavigatorTab.tsx");
  const { en } = await server.ssrLoadModule(fileURLToPath(new URL("../../../packages/i18n/src/locales/en/index.ts", import.meta.url)));
  const i18n = createInstance(); await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const render = props => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(NavigatorView, { error: null, onRefresh() {}, ...props })));
  const snapshot = { unavailableCount: 0, activities: [{ id: "activity", sessionId: "a", createdAt: 1791331200000, endedAt: null, hidden: false, version: 1, requests: [{ id: "request", messageId: "message", turnId: "turn", requestedSkills: ["to-spec", "code-review"], observedSkills: ["to-spec"], outcome: "normal", errorCode: null }] }] };
  const html = render({ sessionId: "a", snapshot });
  assert.ok(html.includes(en.navigator.outcomes.normal));
  assert.ok(html.includes(en.navigator.actualUseUnknown));
  assert.ok(html.includes(en.navigator.actualUseObserved));
  assert.ok(html.includes(en.navigator.explanation));
  const bound = render({ sessionId: "a", snapshot: { ...snapshot, activeActivityId: "activity" } });
  assert.ok(bound.includes(en.navigator.activityBound));
  assert.ok(bound.includes(en.navigator.endActivity));
  assert.ok(bound.includes(en.navigator.leaveActivity));
  const hiddenBound = render({ sessionId: "a", snapshot: { ...snapshot, activeActivityId: "activity", activities: [{ ...snapshot.activities[0], hidden: true }] } });
  assert.ok(hiddenBound.includes(en.navigator.leaveActivity));
  const ended = render({ sessionId: "a", snapshot: { ...snapshot, activities: [{ ...snapshot.activities[0], endedAt: 1791331200100 }] } });
  assert.ok(ended.includes(en.navigator.activityEnded));
  assert.ok(ended.includes(en.navigator.reopenActivity));
  const busy = render({ sessionId: "a", busy: true, snapshot: { ...snapshot, activeActivityId: "activity" } });
  assert.ok(busy.includes(en.navigator.boundaryBusy));
  assert.ok(render({ sessionId: "a", snapshot: { activities: [], unavailableCount: 0 } }).includes(en.navigator.empty));
  assert.ok(render({ sessionId: "native-pi:imported", snapshot: null }).includes(en.navigator.unsupported));
  assert.equal(executions, 0);
});

test("工程活动控制契约拒绝缺失归属、非法版本和动作", async () => {
  const { navigatorControlInput } = await import("@pi-desktop/shared");
  const valid = { sessionId: "conversation-a", activityId: "activity-a", expectedVersion: 3, action: "end" };
  assert.deepEqual(navigatorControlInput(valid), valid);
  for (const input of [ { ...valid, action: "approve" }, { ...valid, expectedVersion: 0 }, { ...valid, expectedVersion: 1.5 }, { ...valid, activityId: "" }, { ...valid, sessionId: "" } ]) assert.throws(() => navigatorControlInput(input));
});
