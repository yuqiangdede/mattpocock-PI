import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const renderer = await import("../src/lib/api.ts");
const { createProviderCatalogRuntime } = await import("../electron/main/runtime/provider-catalog.ts");
const main = createProviderCatalogRuntime({ getHost: () => null, modelsDevCatalog: {} });

test("settings read-modify-write preserves disabled retry and unrelated preferences", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { piDesktop: { platform: "win32" } };
  try {
    for (const stored of [{}, { infiniteProviderRetry: false }, { infiniteProviderRetry: true }]) {
      const original = { defaultMode: "agent", theme: "light", ...stored };
      const received = structuredClone(main.normalizeSettings(original));
      const displayed = renderer.normalizeSettings(received);
      const edited = { ...displayed, imageGeneration: { providerId: "images", modelId: "image" } };
      const outgoing = renderer.validateSettingsWrite(edited);
      const persisted = main.validateSettingsWrite(structuredClone(outgoing));
      assert.equal(persisted.infiniteProviderRetry, stored.infiniteProviderRetry === true);
      assert.equal(persisted.theme, "light");
      assert.deepEqual(persisted.imageGeneration, edited.imageGeneration);
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("invalid retry writes stay rejected at both boundaries", () => {
  for (const value of [undefined, null, "yes", 0, {}]) {
    const settings = { infiniteProviderRetry: value };
    assert.throws(() => renderer.validateSettingsWrite(settings), /infiniteProviderRetry is invalid/);
    assert.throws(() => main.validateSettingsWrite(settings), /infiniteProviderRetry is invalid/);
  }
});


test("engineering preferences survive both settings boundaries without rewinding check metadata", () => {
  const input = { engineeringShortcutPrompts: { ask: "", implement: null }, engineeringSkillUpdateMode: "manual", engineeringSkillCheck: { attemptedAt: 1 } };
  const result = main.validateSettingsWrite(renderer.validateSettingsWrite(input));
  assert.deepEqual(result.engineeringShortcutPrompts, input.engineeringShortcutPrompts);
  assert.equal(result.engineeringSkillUpdateMode, "manual");
  assert.equal(result.engineeringSkillCheck, undefined);
  for (const invalid of [{ engineeringShortcutPrompts: { unknown: "x" } }, { engineeringSkillUpdateMode: "auto-install" }]) {
    assert.throws(() => renderer.validateSettingsWrite(invalid), /invalid/);
    assert.throws(() => main.validateSettingsWrite(invalid), /invalid/);
  }
});
