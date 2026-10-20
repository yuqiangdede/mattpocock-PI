import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bundleAgentRuntime } from "./bundle.mjs";

test("bundle installation survives a transient Windows rename denial", { skip: process.platform !== "win32" }, async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "pi-bundle-rename-"));
  const output = join(root, "dist-bundle");
  const rename = fs.rename;
  let denied = false;
  await fs.mkdir(output);
  await fs.writeFile(join(output, "previous.txt"), "previous bundle");
  t.mock.method(fs, "rename", async (source, destination) => {
    if (!denied && source.includes(".dist-bundle-stage-") && destination === output) {
      denied = true;
      throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
    }
    return rename(source, destination);
  });
  syncBuiltinESMExports();
  try {
    await bundleAgentRuntime(output);
    assert.equal(denied, true);
    assert.equal(JSON.parse(await fs.readFile(join(output, "package.json"), "utf8")).type, "module");
    assert.ok((await fs.stat(join(output, "sidecar.js"))).size > 1000);
    assert.deepEqual(await fs.readdir(root), ["dist-bundle"]);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await fs.rm(root, { recursive: true, force: true });
  }
});

for (const code of ["EPERM", "EBUSY", "EACCES"]) {
  test(`bundle installation preserves previous output after persistent ${code}`, async (t) => {
    const root = await fs.mkdtemp(join(tmpdir(), "pi-bundle-rollback-"));
    const output = join(root, "dist-bundle");
    const rename = fs.rename;
    const failure = Object.assign(new Error(code), { code });
    let attempts = 0;
    await fs.mkdir(output);
    await fs.writeFile(join(output, "previous.txt"), "previous bundle");
    t.mock.method(fs, "rename", async (source, destination) => {
      if (source.includes(".dist-bundle-stage-") && destination === output) {
        attempts += 1;
        throw failure;
      }
      return rename(source, destination);
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(bundleAgentRuntime(output), (error) => error === failure);
      assert.equal(attempts, process.platform === "win32" && code !== "EACCES" ? 6 : 1);
      assert.equal(await fs.readFile(join(output, "previous.txt"), "utf8"), "previous bundle");
      assert.deepEqual(await fs.readdir(root), ["dist-bundle"]);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
