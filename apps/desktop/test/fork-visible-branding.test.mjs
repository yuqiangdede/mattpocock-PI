import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async path => readFile(new URL(path, import.meta.url), "utf8");
const brand = "mattpocock-PI";
const locales = ["de", "en", "es", "fr", "ko", "pt-BR", "tr", "zh-CN", "zh-TW"];

test("all shipping locale surfaces use the fork brand, not upstream branding", async () => {
  for (const locale of locales) {
    const source = await read(`../../../packages/i18n/src/locales/${locale}/index.ts`);
    assert.ok(source.includes(brand), `${locale} must include the fork brand`);
    assert.ok(!source.includes("PI-Desktop"), `${locale} retains an upstream UI brand`);
  }
});

test("window, about page, tray, html and package metadata use the fork display name", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.build.productName, brand);
  assert.equal(pkg.build.win.executableName, brand);
  assert.equal(pkg.build.nsis.shortcutName, brand);
  const html = await read("../index.html");
  assert.ok(html.includes(`<title>${brand}</title>`));
  const windowSource = await read("../electron/main/bootstrap/window.ts");
  assert.match(windowSource, /title:\s*APP_DISPLAY_NAME/);
  const traySource = await read("../electron/main/bootstrap/app-lifecycle.ts");
  assert.match(traySource, /setToolTip\(APP_DISPLAY_NAME\)/);
  const settingsSource = await read("../src/features/settings/SettingsPage.tsx");
  assert.match(settingsSource, /\{"mattpocock-PI"\}/);
});

test("legacy application storage identity remains unchanged", async () => {
  const protocol = await read("../../../packages/shared/src/protocol.ts");
  assert.match(protocol, /APP_NAME = "PI-Desktop"/);
  assert.match(protocol, /APP_DISPLAY_NAME = forkConfig.displayName/);
  const pkg = JSON.parse(await read("../package.json"));
  assert.equal(pkg.build.appId, "net.aiuo.pi-desktop");
});
