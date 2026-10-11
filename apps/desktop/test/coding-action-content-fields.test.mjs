import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("settings show effective defaults and preserve edit, clear, reset and selection semantics", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, logLevel: "silent",
    cacheDir: fileURLToPath(new URL("../../../cache/action-content-ssr", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)) } },
  });
  t.after(() => server.close());
  const { zhCN } = await server.ssrLoadModule("../../packages/i18n/src/locales/zh-CN/index.ts");
  const i18n = createInstance();
  await i18n.init({ lng: "zh-CN", resources: { "zh-CN": { translation: zhCN } } });
  const { CodingActionContentFields } = await server.ssrLoadModule("/src/features/extensions/CodingActionContentFields.tsx");
  const { executeCodingAction } = await server.ssrLoadModule("/src/features/coding/execute-coding-action.ts");
  let action = { id: "spec", label: "Spec", skillId: "to-spec" };
  const catalog = [{ kind: "skill", name: "to-spec", skillId: "to-spec", title: "Spec" }];
  const render = () => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(CodingActionContentFields, { action, catalog, disabled: false, onChange: patch => { action = { ...action, ...patch }; } })));
  let html = render();
  assert.ok(html.includes(zhCN.coding.prompts.spec));
  assert.ok(html.includes(zhCN.coding.skillGuides.spec.purpose));
  assert.ok(html.includes(zhCN.codingActions.promptDefault));
  assert.equal(action.prompt, undefined, "viewing defaults must not persist an override");
  // Drive the actual component callbacks at its public controlled-field boundary.
  const { CodingActionContentView } = await server.ssrLoadModule("/src/features/extensions/CodingActionContentFields.tsx");
  const view = () => CodingActionContentView({ action, catalog, disabled: false, onChange: patch => { action = { ...action, ...patch }; }, t: i18n.t.bind(i18n) });
  const elements = element => element && typeof element === "object" && element.props
    ? [element, ...[].concat(element.props.children ?? []).flatMap(elements)] : [];
  const promptInput = () => elements(view()).find(element => element.props["aria-label"] === zhCN.codingActions.prompt);
  const restoreButton = () => elements(view()).find(element => element.props.children === zhCN.codingActions.restoreDefaultPrompt);
  promptInput().props.onChange({ target: { value: "custom request" } });
  assert.ok(render().includes("custom request"));
  assert.ok(render().includes(zhCN.codingActions.promptCustom));
  promptInput().props.onChange({ target: { value: "" } });
  assert.ok(render().includes(zhCN.codingActions.promptEmpty));
  restoreButton().props.onClick();
  assert.equal(action.prompt, null);
  assert.ok(render().includes(zhCN.coding.prompts.spec));
  let draft;
  await executeCodingAction("spec", { configuration: { schemaVersion: 1, actions: [action] }, catalog: async () => catalog, isCurrent: () => true, defaultPrompt: () => zhCN.coding.prompts.spec, readLiveDraft: () => "", applyDraft: text => { draft = text; } });
  assert.equal(draft, `/to-spec ${zhCN.coding.prompts.spec}`);
  action = { ...action, skillId: "custom-skill" };
  assert.ok(render().includes(zhCN.codingActions.promptNone));
  assert.ok(!render().includes(zhCN.coding.prompts.spec));
  action = { ...action, skillId: "to-spec", description: "Custom guidance", prompt: "Keep this" };
  assert.ok(render().includes("Custom guidance"));
  assert.ok(render().includes("Keep this"));
  const { codingShortcutTooltip } = await server.ssrLoadModule("/src/features/coding/coding-shortcut-tooltip.ts");
  const descriptionInput = () => elements(view()).find(element => element.props["aria-label"] === zhCN.codingActions.descriptionAria);
  assert.equal(descriptionInput().props.value, "Custom guidance");
  assert.ok(codingShortcutTooltip({ action, configured: true }, catalog, i18n.t.bind(i18n)).includes(zhCN.skillGates.description));
  descriptionInput().props.onChange({ target: { value: "" } });
  assert.ok(descriptionInput().props.value.includes(zhCN.coding.skillGuides.spec.purpose));
  assert.ok(!descriptionInput().props.value.includes(zhCN.skillGates.description));
});
