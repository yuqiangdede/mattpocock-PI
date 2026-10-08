import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("Hikvision setup offers the endpoint and asks for the user's SK", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, logLevel: "silent",
    cacheDir: fileURLToPath(new URL("../../../cache/hikvision-ssr", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)) } },
  });
  t.after(() => server.close());
  const { zhCN } = await server.ssrLoadModule("../../packages/i18n/src/locales/zh-CN/index.ts");
  const { NAMED_ENDPOINT_PRESETS, matchNamedPreset } = await server.ssrLoadModule("../../packages/shared/src/provider-presets.ts");
  const { namedServiceOptions, filterServiceOptions } = await server.ssrLoadModule("/src/components/settings/service-catalog.ts");
  const { ProviderConnectionFields } = await server.ssrLoadModule("/src/components/settings/ProviderConnectionFields.tsx");
  const i18n = createInstance();
  await i18n.init({ lng: "zh-CN", resources: { "zh-CN": { translation: zhCN } } });
  const options = namedServiceOptions(i18n.t.bind(i18n));
  for (const query of ["海康", "hikvision", "lanz.hikvision.com"]) {
    assert.deepEqual(filterServiceOptions(options, query).map(option => option.id), ["hikvision"]);
  }
  const preset = NAMED_ENDPOINT_PRESETS.find(item => item.id === "hikvision");
  assert.equal(preset.baseUrl, "http://lanz.hikvision.com/v3/openai/model/v1");
  assert.equal(preset.apiStyle, "chat_completions");
  assert.equal(matchNamedPreset({ baseUrl: preset.baseUrl })?.id, "hikvision");
  const render = (editing, apiKey) => renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(ProviderConnectionFields, {
      named: true, custom: false, editing, saving: false,
      serviceLabel: i18n.t(preset.labelKey), serviceBaseUrl: preset.baseUrl,
      apiKeyRef: { current: null }, nameRef: { current: null },
      apiKey, name: preset.name, baseUrl: preset.baseUrl, apiStyle: preset.apiStyle,
      accountOnlyApiStyle: false, requiresApiStyleChoice: false,
    })));
  const initial = render(false, "");
  assert.ok(initial.includes("海康"));
  assert.ok(initial.includes("lanz.hikvision.com/v3/openai/model/v1"));
  assert.ok(initial.includes("请直接填写 SK（API Key）"));
  assert.ok(initial.includes('type="password"'));
  assert.ok(initial.includes('value=""'));
  assert.ok(render(true, "").includes(zhCN.settings.apiKeyKeepHint));
});
