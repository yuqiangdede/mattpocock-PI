import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC } from "@pi-desktop/shared";
import { readOpenableFile } from "@pi-desktop/host-runtime";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { registerWorkflowArtifactsIpc } = await import("../electron/main/ipc/workflow-artifacts-ipc.ts");

test("reference opening keeps the existing file reader's current-root permissions", async () => {
  const scratch = fileURLToPath(new URL("../../../.pi-desktop-test/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(join(scratch, "reference-ipc-"));
  try {
    const rootA = join(dir, "a"); const rootB = join(dir, "b");
    await Promise.all([mkdir(rootA), mkdir(rootB)]);
    const path = join(rootA, "glossary.md"); await writeFile(path, "fixture glossary", "utf8");
    const result = { entry: { reference: { id: "ref-a", workspaceRoot: rootA }, availability: "available", historical: false }, path };
    let currentRoot = rootB;
    const calls = [];
    const host = { call: async (method, input) => { calls.push({ method, input }); return result; } };
    const handlers = new Map();
    registerWorkflowArtifactsIpc({ registrar: { handle: (channel, handler) => handlers.set(channel, handler) }, getHost: () => host,
      readFile: (path) => readOpenableFile(path, currentRoot, []) });
    const input = { projectGroupId: "project-a", runId: "run-a", referenceId: "ref-a" };
    await assert.rejects(handlers.get(IPC.invoke.workflowArtifactOpen)(input), /outside allowed roots/);
    currentRoot = rootA;
    assert.deepEqual(await handlers.get(IPC.invoke.workflowArtifactOpen)(input), result);
    assert.equal(calls.every((call) => call.method === "workflow.artifact.resolve"), true);
    assert.equal(calls.every((call) => call.input.referenceId === "ref-a"), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("unavailable references never invoke file reading and identities remain required", async () => {
  const handlers = new Map();
  const missing = { entry: { availability: "missing" }, path: null };
  registerWorkflowArtifactsIpc({ registrar: { handle: (channel, handler) => handlers.set(channel, handler) },
    getHost: () => ({ call: async () => missing }), readFile: assert.fail });
  assert.deepEqual(await handlers.get(IPC.invoke.workflowArtifactOpen)({ projectGroupId: "a", runId: "run", referenceId: "ref" }), missing);
  await assert.rejects(handlers.get(IPC.invoke.workflowArtifactList)({ projectGroupId: "a", runId: "" }), /identity required/);
});

test("reference opening refuses a changed host or changed resolved path after reading", async () => {
  const request = { projectGroupId: "a", runId: "run", referenceId: "ref" };
  for (const change of ["host", "path"]) {
    const handlers = new Map();
    let readStarted;
    let releaseRead;
    const started = new Promise((resolve) => { readStarted = resolve; });
    const held = new Promise((resolve) => { releaseRead = resolve; });
    let path = "/registered/first.md";
    const owner = { call: async () => ({ entry: { availability: "available" }, path }) };
    let host = owner;
    registerWorkflowArtifactsIpc({ registrar: { handle: (channel, handler) => handlers.set(channel, handler) },
      getHost: () => host, readFile: async () => { readStarted(); await held; } });
    const opening = handlers.get(IPC.invoke.workflowArtifactOpen)(request);
    const rejected = assert.rejects(opening, /changed during/);
    await started;
    if (change === "host") host = { call: assert.fail };
    else path = "/registered/second.md";
    releaseRead();
    await rejected;
  }
});

test("registration rejects revisions that cannot round-trip safely through JavaScript", async () => {
  const handlers = new Map();
  registerWorkflowArtifactsIpc({ registrar: { handle: (channel, handler) => handlers.set(channel, handler) },
    getHost: () => ({ call: assert.fail }), readFile: assert.fail });
  for (const key of ["stageRevision", "expectedRevision"]) {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, -1, 0.5, "1"]) {
      await assert.rejects(handlers.get(IPC.invoke.workflowArtifactRegister)({ stageRevision: 1, expectedRevision: 0, [key]: value }), /safe revision/);
    }
  }
});
