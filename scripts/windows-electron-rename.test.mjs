import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const desktopRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const builderRequire = createRequire(desktopRequire.resolve("electron-builder"));
const source = await readFile(builderRequire.resolve("app-builder-lib/out/util/electronGet.js"), "utf8");

async function extract({ platform = "win32", failures = [], permanent, copyError } = {}) {
  let attempts = 0, released = false;
  const delays = [];
  const removed = [];
  const copied = [];
  const exports = {};
  const context = {
    exports, process: { platform },
    setTimeout(callback, delay) { delays.push(delay); callback(); },
    require(name) {
      if (name === "fs/promises") return {
        mkdir: async () => {}, rm: async directory => removed.push(directory),
        readdir: async () => ["electron.exe"],
        cp: async (from, to, options) => { copied.push({ from, to, recursive: options.recursive, errorOnExist: options.errorOnExist, force: options.force, verbatimSymlinks: options.verbatimSymlinks }); if (copyError) throw Object.assign(new Error(copyError), { code: copyError }); },
        rename: async () => { const code = failures[attempts++] ?? permanent; if (code) throw Object.assign(new Error(code), { code }); },
      };
      if (name === "proper-lockfile") return { lock: async () => async () => { released = true; } };
      if (name === "tar") return { extract: async () => {} };
      if (name === "builder-util") return { exists: async () => true, log: { warn() {} } };
      return {};
    },
  };
  vm.runInNewContext(source, context);
  let error;
  try { await exports.extractArchive("electron.tgz", "output"); } catch (caught) { error = caught; }
  return { attempts, delays, released, removed, copied, error };
}

test("Windows extraction retries EPERM and EBUSY and preserves the extracted directory", async () => {
  const result = await extract({ failures: ["EPERM", "EBUSY"] });
  assert.equal(result.error, undefined);
  assert.equal(result.attempts, 3);
  assert.deepEqual(result.delays, [1000, 1000]);
  assert.equal(result.removed.filter(directory => directory === "output").length, 1);
  assert.equal(result.released, true);
});

test("Windows extraction copies after exactly five retries and then cleans staging", async () => {
  const result = await extract({ permanent: "EPERM" });
  assert.equal(result.attempts, 6);
  assert.equal(result.delays.length, 5);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.copied, [{ from: "output.tmp", to: "output", recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true }]);
  assert.equal(result.removed.filter(directory => directory === "output.tmp").length, 2);
  assert.equal(result.released, true);
});

test("failed fallback copy reports its error and preserves staging", async () => {
  const result = await extract({ permanent: "EBUSY", copyError: "ENOSPC" });
  assert.equal(result.attempts, 6);
  assert.equal(result.copied.length, 1);
  assert.equal(result.error?.code, "ENOSPC");
  // The only staging removal is the pre-extraction cleanup.
  assert.equal(result.removed.filter(directory => directory === "output.tmp").length, 1);
  assert.equal(result.released, true);
});

test("Windows extraction succeeds on the final allowed retry", async () => {
  const result = await extract({ failures: Array(5).fill("EPERM") });
  assert.equal(result.attempts, 6);
  assert.equal(result.error, undefined);
});

test("other errors and other platforms fail immediately", async () => {
  for (const options of [{ permanent: "EACCES" }, { platform: "linux", permanent: "EPERM" }]) {
    const result = await extract(options);
    assert.equal(result.attempts, 1);
    assert.equal(result.delays.length, 0);
    assert.equal(result.copied.length, 0);
    assert.equal(result.error?.code, options.permanent);
    assert.equal(result.released, true);
  }
});
