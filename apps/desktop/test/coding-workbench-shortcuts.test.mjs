import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("Coding Actions 呈现独立入口，渲染不会执行或调用 Host", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    cacheDir: fileURLToPath(new URL("../../../cache/coding-action-ssr", import.meta.url)),
    configFile: false, logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)) } },
  });
  t.after(() => server.close());
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  let requests = 0, executions = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {},
    piDesktop: { on: () => () => {}, invoke: () => { requests++; throw new Error("渲染不应调用 Host"); } },
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, "window", original); else delete globalThis.window; });
  const { CodingWorkbench } = await server.ssrLoadModule("/src/features/coding/CodingWorkbench.tsx");
  const { en } = await server.ssrLoadModule(fileURLToPath(new URL("../../../packages/i18n/src/locales/en/index.ts", import.meta.url)));
  const i18n = createInstance(); await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(CodingWorkbench, { disabled: false, error: null, onExecute: () => { executions++; } })));
  for (const label of Object.values(en.codingActions.defaults)) assert.ok(html.includes(label));
  assert.ok(html.includes(en.codingActions.configure));
  assert.ok(!html.includes(en.coding.requirements.action), "Composer must not expose requirements confirmation");
  assert.doesNotMatch(html, /当前阶段|下一阶段|完成百分比/);
  assert.equal(requests, 0); assert.equal(executions, 0);
});
