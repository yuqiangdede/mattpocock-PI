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
  assert.ok(render({ sessionId: "a", snapshot: { activities: [], unavailableCount: 0 } }).includes(en.navigator.empty));
  assert.ok(render({ sessionId: "native-pi:imported", snapshot: null }).includes(en.navigator.unsupported));
  assert.equal(executions, 0);
});
