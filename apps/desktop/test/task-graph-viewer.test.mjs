import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("task graph entry presents a local inspection form and CLI/Hook gate guidance", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false,
    logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  t.after(() => server.close());
  const { TaskGraphViewerContent } = await server.ssrLoadModule("/src/features/coding/TaskGraphViewer.tsx");
  const { taskGraphEnglish, skillGatesEnglish } = await server.ssrLoadModule(fileURLToPath(new URL("../../../packages/i18n/src/task-graph-messages.ts", import.meta.url)));
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: { taskGraph: taskGraphEnglish, skillGates: skillGatesEnglish } } } });
  let closes = 0;
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(TaskGraphViewerContent, { onClose: () => closes++ })));
  assert.match(html, /role="dialog"/);
  assert.match(html, /<textarea/);
  assert.ok(html.includes(taskGraphEnglish.inspect));
  assert.ok(html.includes(skillGatesEnglish.description));
  assert.ok(html.includes(taskGraphEnglish.purpose));
  assert.equal(closes, 0);
});
