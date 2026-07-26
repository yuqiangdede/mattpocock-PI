import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainSource = await readFile(
  new URL("../electron/main/index.ts", import.meta.url),
  "utf8",
);
const iconScriptSource = await readFile(
  new URL("../../../scripts/make-icon.py", import.meta.url),
  "utf8",
);

test("macOS development uses the canonical PI-Desktop Dock icon", () => {
  assert.match(
    mainSource,
    /process\.platform !== "darwin" \|\| !isDevelopmentBuild \|\| !app\.dock/,
  );
  assert.match(
    mainSource,
    /join\(app\.getAppPath\(\), "build", "icon_1024\.png"\)/,
  );
  assert.match(mainSource, /nativeImage\.createFromPath\(iconPath\)/);
  assert.match(mainSource, /if \(icon\.isEmpty\(\)\)/);
  assert.match(mainSource, /app\.dock\.setIcon\(icon\)/);
  assert.match(
    mainSource,
    /app\.whenReady\(\)\.then\(async \(\) => \{\s+applyDevelopmentBranding\(\);/,
  );
});

test("macOS icon derivation preserves the canonical renderer asset", () => {
  assert.match(iconScriptSource, /SOURCE = BUILD \/ "icon_1024\.png"/);
  assert.match(iconScriptSource, /with Image\.open\(SOURCE\) as source/);
  assert.doesNotMatch(
    iconScriptSource,
    /\.save\(BUILD \/ "icon_1024\.png"\)/,
  );
});
