import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("plain prompt settings edit names and text, add, reorder, disable and restore without altering Skills", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, logLevel: "silent",
    cacheDir: fileURLToPath(new URL("../../../cache/prompt-settings-ssr", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)) } },
  });
  t.after(() => server.close());
  const { zhCN } = await server.ssrLoadModule("../../packages/i18n/src/locales/zh-CN/index.ts");
  const { createDefaultCodingActions, validateCodingActions } = await server.ssrLoadModule("../../packages/shared/src/index.ts");
  const { CodingPromptSettings, CodingPromptSettingsView } = await server.ssrLoadModule("/src/features/extensions/CodingPromptSettings.tsx");
  const i18n = createInstance(); await i18n.init({ lng: "zh-CN", resources: { "zh-CN": { translation: zhCN } } });
  const original = createDefaultCodingActions();
  let configuration = structuredClone(original), selected = "commit-code", disabled = false;
  const props = () => ({ configuration, disabled, onChange: value => { configuration = value; }, selected, onSelect: id => { selected = id; }, t: i18n.t.bind(i18n) });
  const elements = element => element && typeof element === "object" && element.props
    ? [element, ...[].concat(element.props.children ?? []).flatMap(elements)] : [];
  const field = label => elements(CodingPromptSettingsView(props())).find(element => element.props["aria-label"] === label);
  const button = label => elements(CodingPromptSettingsView(props())).find(element => element.props.children === label);
  const render = () => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(CodingPromptSettings, props())));
  assert.ok(render().includes(zhCN.codingActions.commitCode));
  assert.ok(render().includes(zhCN.codingActions.commitPrompt));
  assert.deepEqual(configuration, original, "viewing defaults must not persist them");
  field(zhCN.codingActions.promptName).props.onChange({ target: { value: "My commit" } });
  field(zhCN.codingActions.promptText).props.onChange({ target: { value: "Build and commit my changes" } });
  assert.equal(configuration.promptActions[0].label, "My commit");
  assert.equal(configuration.promptActions[0].prompt, "Build and commit my changes");
  button(zhCN.codingActions.restoreDefaultPrompt).props.onClick();
  assert.equal(configuration.promptActions[0].prompt, null);
  assert.equal(configuration.promptActions[0].label, "My commit");
  button(zhCN.codingActions.addPrompt).props.onClick();
  field(zhCN.codingActions.promptName).props.onChange({ target: { value: "Summary" } });
  field(zhCN.codingActions.promptText).props.onChange({ target: { value: "Summarize changes" } });
  button(zhCN.codingActions.moveUp).props.onClick();
  assert.equal(configuration.promptActions[0].label, "Summary");
  field(zhCN.codingActions.enablePrompt).props.onChange({ target: { checked: false } });
  assert.equal(configuration.promptActions[0].enabled, false);
  validateCodingActions(configuration);
  const before = structuredClone(configuration);
  disabled = true;
  field(zhCN.codingActions.promptName).props.onChange({ target: { value: "Should not change" } });
  button(zhCN.codingActions.addPrompt).props.onClick();
  assert.deepEqual(configuration, before);
  assert.deepEqual(configuration.actions, original.actions);
  disabled = false;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { confirm: () => false } });
  t.after(() => { if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window; });
  button(zhCN.codingActions.delete).props.onClick();
  assert.deepEqual(configuration, before, "cancelling deletion preserves edits");
  window.confirm = () => true;
  button(zhCN.codingActions.delete).props.onClick();
  assert.equal(configuration.promptActions.length, 1);
  assert.equal(configuration.promptActions[0].label, "My commit");
  button(zhCN.codingActions.delete).props.onClick();
  assert.deepEqual(configuration.promptActions, []);
});
