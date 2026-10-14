import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const desktopRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const builderRequire = createRequire(desktopRequire.resolve("electron-builder"));
const source = await readFile(builderRequire.resolve("app-builder-lib/out/util/resEdit.js"), "utf8");

async function update({ failures = [], permanent, platform = "win32", writeError } = {}) {
  const events = [], delays = [];
  let attempts = 0;
  const executable = { generate: () => Buffer.from("updated executable") };
  const exports = {};
  vm.runInNewContext(source, {
    exports, Buffer, process: { platform },
    setTimeout(callback, delay) { delays.push(delay); callback(); },
    require(name) {
      if (name === "builder-util") return { log: { warn() {}, info() {}, filePath: value => value } };
      if (name === "resedit") return {
        NtExecutable: { from: () => executable },
        NtExecutableResource: { from: () => ({ entries: [], outputResource() {} }) },
        Resource: {
          VersionInfo: {
            fromEntries: () => [{
              getAllLanguagesForStringValues: () => [{ lang: 1033, codepage: 1200 }],
              setStringValues() {}, setFileVersion() {}, setProductVersion() {}, outputToResourceEntries() {},
            }],
          },
        },
      };
      if (name === "fs/promises") return {
        readFile: async () => Buffer.from("original executable"),
        open: async (_file, flags) => {
          events.push(flags);
          const code = failures[attempts++] ?? permanent;
          if (code) throw Object.assign(new Error(code), { code });
          return {
            writeFile: async data => {
              events.push(data.toString());
              if (writeError) throw Object.assign(new Error(writeError), { code: writeError });
            },
            truncate: async size => events.push(size),
            close: async () => events.push("closed"),
          };
        },
      };
      throw new Error(`Unexpected external dependency: ${name}`);
    },
  });
  let error;
  try {
    await exports.editWindowsResources({ file: "app.exe", versionStrings: {}, fileVersion: "1.0.0", productVersion: "1.0.0" });
  } catch (caught) {
    error = caught;
  }
  return { events, delays, attempts, error };
}

test("resource editing write retries transient access errors and writes without truncating on open", async () => {
  const result = await update({ failures: ["UNKNOWN", "EPERM", "EBUSY"] });
  assert.equal(result.error, undefined);
  assert.equal(result.attempts, 4);
  assert.deepEqual(result.delays, [1000, 1000, 1000]);
  assert.deepEqual(result.events.slice(-3), ["updated executable", 18, "closed"]);
  assert.equal(result.events.filter(event => event === "r+").length, 4);
});

test("resource editing access stops after five retries without writing any executable bytes", async () => {
  const result = await update({ permanent: "UNKNOWN" });
  assert.equal(result.attempts, 6);
  assert.equal(result.delays.length, 5);
  assert.equal(result.error?.code, "UNKNOWN");
  assert.deepEqual(result.events, Array(6).fill("r+"));
});

test("write failure closes the handle and never truncates or retries a partial write", async () => {
  const result = await update({ writeError: "ENOSPC" });
  assert.equal(result.error?.code, "ENOSPC");
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.events, ["r+", "updated executable", "closed"]);
});

test("other access errors and other platforms fail immediately", async () => {
  for (const options of [{ permanent: "EACCES" }, { permanent: "UNKNOWN", platform: "linux" }]) {
    const result = await update(options);
    assert.equal(result.attempts, 1);
    assert.equal(result.delays.length, 0);
    assert.equal(result.error?.code, options.permanent);
  }
});

