import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { IPC } from "@pi-desktop/shared";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { registerRequirementsIpc } = await import("../electron/main/ipc/requirements-ipc.ts");
const target = { projectGroupId: "project-a", workspaceRoot: "C:/project", relativePath: "spec.md" };

function fixture({ readFile = async () => {}, resolvePaths = ["C:/project/spec.md"], hostChanged = false } = {}) {
  const calls = [];
  const handlers = new Map();
  let resolutions = 0;
  const host = { call: async (method, input) => {
    calls.push({ method, input });
    if (method === "requirements.resolve") return { path: resolvePaths[Math.min(resolutions++, resolvePaths.length - 1)] };
    return { revision: 1 };
  } };
  registerRequirementsIpc({ registrar: { handle: (channel, handler) => handlers.set(channel, handler) }, getHost: () => hostChanged && resolutions > 0 ? { call: host.call } : host, readFile });
  return { calls, handlers };
}

test("requirements approval preserves file permissions and never dispatches an Agent or accepts a stage", async () => {
  const reads = [];
  const { calls, handlers } = fixture({ readFile: async path => reads.push(path) });
  const decision = { ...target, expectedRevision: 0, contentHash: "a".repeat(64) };
  assert.deepEqual(await handlers.get(IPC.invoke.requirementsConfirm)(decision), { revision: 1 });
  assert.deepEqual(reads, ["C:/project/spec.md"]);
  assert.deepEqual(calls.map(call => call.method), ["requirements.resolve", "requirements.resolve", "requirements.confirm"]);
  assert.deepEqual(calls[2].input, decision);
});

test("denied file access, a replaced path or host restart cannot write a confirmation", async () => {
  for (const options of [
    { readFile: async () => { throw new Error("Access denied"); } },
    { resolvePaths: ["C:/project/spec.md", "C:/project/other.md"] },
    { hostChanged: true },
  ]) {
    const { calls, handlers } = fixture(options);
    await assert.rejects(handlers.get(IPC.invoke.requirementsConfirm)({ ...target, expectedRevision: 0, contentHash: "a".repeat(64) }));
    assert.equal(calls.some(call => call.method === "requirements.confirm"), false);
  }
});

test("invalid native requests fail before reaching the host", async () => {
  const { calls, handlers } = fixture();
  for (const input of [null, [], { ...target, relativePath: "../spec.md" }, { ...target, runId: "untracked" }]) {
    await assert.rejects(handlers.get(IPC.invoke.requirementsPreview)(input));
  }
  assert.deepEqual(calls, []);
});
