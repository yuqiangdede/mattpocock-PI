import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const desktopPackageUrl = new URL("../package.json", import.meta.url);

test("desktop dev builds all workspace dependencies before Electron starts", async () => {
  const pkg = JSON.parse(await readFile(desktopPackageUrl, "utf8"));
  const predev = pkg.scripts?.predev ?? "";
  const dependencyBuild = "pnpm --filter '@pi-desktop/desktop^...' build";
  const hostBuild = "cargo build --manifest-path ../../Cargo.toml -p host-core";

  assert.ok(
    predev.includes(dependencyBuild),
    "predev must rebuild every workspace dependency consumed by Electron",
  );
  assert.ok(predev.includes(hostBuild), "predev must continue building host-core");
  assert.ok(
    predev.indexOf(dependencyBuild) < predev.indexOf(hostBuild),
    "workspace dependency builds must complete before the desktop boot sequence continues",
  );
});
