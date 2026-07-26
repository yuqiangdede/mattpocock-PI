import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const desktopPackageUrl = new URL("../package.json", import.meta.url);

test("desktop dev builds the agent runtime before Electron starts", async () => {
  const pkg = JSON.parse(await readFile(desktopPackageUrl, "utf8"));
  const predev = pkg.scripts?.predev ?? "";
  const runtimeBuild = "pnpm -C ../../packages/agent-runtime build";
  const hostBuild = "cargo build --manifest-path ../../Cargo.toml -p host-core";

  assert.ok(
    predev.includes(runtimeBuild),
    "predev must rebuild the sidecar artifact consumed by Electron",
  );
  assert.ok(predev.includes(hostBuild), "predev must continue building host-core");
  assert.ok(
    predev.indexOf(runtimeBuild) < predev.indexOf(hostBuild),
    "the sidecar build must complete before the desktop boot sequence continues",
  );
});
