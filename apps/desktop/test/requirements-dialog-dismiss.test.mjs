import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("requirements dialog remains dismissible while a request is pending", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    cacheDir: fileURLToPath(new URL("../../../cache/requirements-dialog-test", import.meta.url)),
    configFile: false, logLevel: "silent", appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "pending-requirements-boundary", enforce: "pre", transform(code, id) {
      if (id.endsWith("/useRequirementsConfirmation.ts")) return "export function useRequirementsConfirmation() { return { busy: true, group: null, root: '', path: '', preview: null, history: null, error: null }; }";
      if (id.endsWith("/RequirementsConfirmation.tsx")) return code + "\nexport { RequirementsConfirmationDialog };";
    } }],
  });
  t.after(() => server.close());
  const { RequirementsConfirmationDialog } = await server.ssrLoadModule("/src/features/requirements/RequirementsConfirmation.tsx");
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: {} } } });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(RequirementsConfirmationDialog, { projectPath: "project", onClose() {} })));
  const cancel = html.match(/<button\b[^>]*>common.cancel<\/button>/)?.[0];
  assert.ok(cancel, "Cancel button must be available");
  assert.doesNotMatch(cancel, /disabled/, "Pending requests must not lock dismissal");
});
