import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";

register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { ENGINEERING_SHORTCUTS } = await import("@pi-desktop/shared");
const { en } = await import("../../../packages/i18n/src/locales/en/index.ts");
const { zhCN } = await import("../../../packages/i18n/src/locales/zh-CN/index.ts");

test("every engineering entry has complete localized usage guidance", () => {
  for (const catalog of [en, zhCN]) {
    assert.deepEqual(Object.keys(catalog.coding.skillGuides).sort(), ENGINEERING_SHORTCUTS.map(item => item.action).sort());
    for (const { action } of ENGINEERING_SHORTCUTS) {
      for (const section of ["when", "purpose", "example"]) {
        const text = catalog.coding.skillGuides[action][section];
        assert.ok(text.trim(), `${action}.${section}`);
        assert.ok(!text.includes("\uFFFD"), `${action}.${section} encoding`);
      }
    }
  }
});

test("selected entry renders its guidance in the active language independently of prompt overrides", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    cacheDir: fileURLToPath(new URL("../../../cache/skill-guide-tests", import.meta.url)),
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)) } },
  });
  t.after(() => server.close());
  const { EngineeringSkillDescription } = await server.ssrLoadModule("/src/components/settings/EngineeringSkillDescription.tsx");
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en }, "zh-CN": { translation: zhCN } } });
  const render = action => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(EngineeringSkillDescription, { action })));
  for (const [locale, catalog] of [["en", en], ["zh-CN", zhCN]]) {
    await i18n.changeLanguage(locale);
    for (const { action } of ENGINEERING_SHORTCUTS) {
      const html = render(action);
      for (const section of ["when", "purpose", "example"]) {
        assert.ok(html.includes(catalog.settings.engineering[section]));
        const escaped = renderToStaticMarkup(createElement("span", null, catalog.coding.skillGuides[action][section])).slice(6, -7);
        assert.ok(html.includes(escaped), `${locale}.${action}.${section}`);
      }
      assert.doesNotMatch(html, /<button|<textarea|<input|coding\.skillGuides\./);
    }
    assert.ok(!render("review").includes(catalog.coding.skillGuides.ask.example));
  }

  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let requests = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin: "http://localhost" },
    addEventListener() {}, removeEventListener() {},
    piDesktop: { on: () => () => {}, invoke: () => { requests++; throw new Error("Rendering guidance must not call Host"); } },
  } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  });
  const { EngineeringSkillSettings } = await server.ssrLoadModule("/src/components/settings/EngineeringSkillSettings.tsx");
  const { useAppStore } = await server.ssrLoadModule("/src/stores/app-store.ts");
  const originalSettings = useAppStore.getState().settings;
  const initialState = useAppStore.getInitialState();
  const originalInitialSettings = initialState.settings;
  const prompts = { ask: "My custom instruction", implement: "" };
  useAppStore.setState({ settings: { ...originalSettings, engineeringShortcutPrompts: prompts } });
  // Zustand SSR reads the initial hydration snapshot rather than the live one.
  initialState.settings = useAppStore.getState().settings;
  t.after(() => {
    initialState.settings = originalInitialSettings;
    useAppStore.setState({ settings: originalSettings });
  });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(EngineeringSkillSettings, { onUpdated: async () => {} })));
  assert.ok(html.includes(zhCN.coding.skillGuides.ask.example));
  assert.ok(html.includes("My custom instruction"));
  assert.ok(html.indexOf("engineering-skill-description") < html.indexOf("<textarea"));
  assert.deepEqual(useAppStore.getState().settings.engineeringShortcutPrompts, prompts);
  assert.equal(requests, 0);
  const { CodingWorkbench } = await server.ssrLoadModule("/src/features/coding/CodingWorkbench.tsx");
  let selections = 0;
  for (const [locale, catalog] of [["en", en], ["zh-CN", zhCN]]) {
    await i18n.changeLanguage(locale);
    const workbench = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(CodingWorkbench, { disabled: false, error: null, onSelect: () => { selections++; } })));
    for (const action of ["ask", "discovery", "implement", "diagnose", "review"]) {
      for (const section of ["when", "purpose", "example"]) {
        const escaped = renderToStaticMarkup(createElement("span", null, catalog.coding.skillGuides[action][section])).slice(6, -7);
        assert.ok(workbench.includes(escaped), `${locale}.${action}.${section} missing from Composer guidance`);
      }
    }
  }
  assert.equal(selections, 0);
});
