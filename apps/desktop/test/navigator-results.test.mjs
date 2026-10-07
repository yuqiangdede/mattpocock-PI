import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { IPC, navigatorResultInput } = await import("@pi-desktop/shared");
const { registerNavigatorIpc } = await import("../electron/main/ipc/navigator-ipc.ts");

test("result reader opens only the associated originating project, reports missing files and denies escape", async t => {
  const root = fileURLToPath(new URL("../../../cache/navigator-result-reader/", import.meta.url));
  await mkdir(root, { recursive: true });
  await writeFile(new URL("../../../cache/navigator-result-reader/result.txt", import.meta.url), "verified reference", "utf8");
  t.after(() => rm(root, { recursive: true, force: true }));
  let path = "result.txt";
  const handlers = new Map();
  const host = { async call(method, input) {
    if (method === "navigator.results") {
      assert.equal(input.sessionId, "original");
      return { version: 1, results: [{ id: "file", kind: "file", path }] };
    }
    if (method === "session.get") { assert.equal(input.id, "original"); return { session: { projectPath: root } }; }
    throw new Error("Unexpected execution");
  } };
  registerNavigatorIpc({ handle(channel, handler) { handlers.set(channel, handler); } }, () => host);
  const read = input => handlers.get(IPC.invoke.navigatorReadResult)({ sessionId: "original", activityId: "activity", resultId: "file", ...input });
  assert.equal((await read()).content, "verified reference");
  path = "missing.txt"; await assert.rejects(read());
  path = "../outside.txt"; await assert.rejects(read(), /outside allowed roots/);
  await assert.rejects(read({ resultId: "removed" }), /association unavailable/);
});

test("result boundary rejects malformed IDs, versions and result types", () => {
  assert.deepEqual(navigatorResultInput({ sessionId: "s", activityId: "a", expectedVersion: 1, kind: "file", label: "spec", path: "docs/spec.md" }).kind, "file");
  for (const extra of [{ kind: "observed_test_pass" }, { expectedVersion: -1 }, { path: "bad\0path" }, { activityId: "" }]) {
    assert.throws(() => navigatorResultInput({ sessionId: "s", activityId: "a", ...extra }));
  }
});
