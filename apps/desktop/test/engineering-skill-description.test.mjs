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
    location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {},
    piDesktop: { on: () => () => {}, invoke: () => { requests++; throw new Error("Rendering guidance must not call Host"); } },
  } });
  t.after(() => { if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window; });
  const { CodingActionSettingsPage } = await server.ssrLoadModule("/src/features/extensions/CodingActionSettingsPage.tsx");
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(CodingActionSettingsPage)));
  assert.ok(html.includes("Coding Actions"));
  assert.ok(html.includes("Action 名称"));
  assert.ok(html.includes("Skill id"));
  assert.doesNotMatch(html, /显示位置|更多分组|当前阶段/);
  assert.equal(requests, 0);
});
