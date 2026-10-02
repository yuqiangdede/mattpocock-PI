import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IPC, IPC_WHITELIST } from "../../../packages/shared/src/protocol.ts";
import { ErrorCodes } from "../../../packages/shared/src/errors.ts";
import { WORKFLOW_STAGES } from "../../../packages/shared/src/types/workflow.ts";
import ts from "typescript";

async function loadWorkflowIpc() {
  const file = new URL("../electron/main/ipc/workflow-ipc.ts", import.meta.url);
  const source = ts.transpileModule(await readFile(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: file.pathname,
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", source)((id) => {
    if (id === "@pi-desktop/shared") return { ErrorCodes, IPC, WORKFLOW_STAGES };
    if (id === "../host-process" || id === "./types") return {};
    throw new Error(`unexpected workflow IPC dependency: ${id}`);
  }, module.exports, module);
  return module.exports.registerWorkflowIpc;
}

const registerWorkflowIpc = await loadWorkflowIpc();

function workflowHarness(host) {
  const handlers = new Map();
  registerWorkflowIpc({
    registrar: { handle: (channel, handler) => handlers.set(channel, handler) },
    getHost: () => host,
  });
  return handlers;
}

test("native workflow actions cross the allowed IPC boundary with project revisions", async () => {
  const calls = [];
  const host = { call: async (method, input) => { calls.push({ method, input }); return { ok: true }; } };
  const handlers = workflowHarness(host);
  assert.equal(IPC_WHITELIST.has(IPC.invoke.workflowHistoryList), true);
  assert.equal(IPC_WHITELIST.has(IPC.invoke.workflowHistoryRead), true);
  assert.equal(IPC_WHITELIST.has(IPC.invoke.workflowRunCreate), true);
  assert.equal(IPC_WHITELIST.has(IPC.invoke.workflowRunArchive), true);

  await handlers.get(IPC.invoke.workflowHistoryList)();
  await handlers.get(IPC.invoke.workflowHistoryRead)({ projectGroupId: " group-a " });
  await handlers.get(IPC.invoke.workflowRunCreate)({
    projectGroupId: " group-a ", title: "  First effort  ", expectedRevision: 4,
  });
  await handlers.get(IPC.invoke.workflowRunArchive)({
    projectGroupId: "group-a", runId: "run-1", expectedRevision: 5,
  });
  assert.deepEqual(calls, [
    { method: "workflow.history.list", input: undefined },
    { method: "workflow.history.read", input: { projectGroupId: "group-a" } },
    { method: "workflow.run.create", input: { projectGroupId: "group-a", title: "First effort", expectedRevision: 4 } },
    { method: "workflow.run.archive", input: { projectGroupId: "group-a", runId: "run-1", expectedRevision: 5 } },
  ]);
});

test("workflow mutations reject blank identity, blank title, and nonnumeric revisions", async () => {
  const calls = [];
  const handlers = workflowHarness({ call: async (...args) => calls.push(args) });
  await assert.rejects(
    handlers.get(IPC.invoke.workflowRunCreate)({ projectGroupId: "group-a", title: " ", expectedRevision: 0 }),
    (error) => error.errorCode === ErrorCodes.INVALID_ARGUMENT,
  );
  await assert.rejects(
    handlers.get(IPC.invoke.workflowRunCreate)({ projectGroupId: "group-a", title: "Valid", expectedRevision: "0" }),
    (error) => error.errorCode === ErrorCodes.INVALID_ARGUMENT,
  );
  await assert.rejects(
    handlers.get(IPC.invoke.workflowRunArchive)({ projectGroupId: "", runId: "run-1", expectedRevision: 0 }),
    (error) => error.errorCode === ErrorCodes.INVALID_ARGUMENT,
  );
  assert.deepEqual(calls, []);
});

test("the native panel exposes project history and delegates stage interaction to its execution controls", async () => {
  const [panel, workflow, tabs] = await Promise.all([
    readFile(new URL("../src/components/workpanel/WorkPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/workpanel/WorkflowTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/work-panel-tabs.ts", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /id: "workflow"[\s\S]*?toolWorkPanelTab\("workflow"\)/);
  assert.match(panel, /activeTab\?\.kind === "workflow"[\s\S]*?<WorkflowTab projectPath=\{activeProjectPath\} projectMeta=\{projectMeta\} sessionId=\{activeSessionId\} \/>/);
  assert.match(workflow, /api\.createWorkflowRun\(/);
  assert.match(workflow, /api\.readWorkflowHistory\(/);
  assert.match(workflow, /selectUnavailableRun/);
  assert.match(workflow, /aria-pressed=/);
  assert.match(workflow, /selectedUnavailableRun/);
  assert.match(workflow, /api\.archiveWorkflowRun\(/);
  assert.match(workflow, /stage\.status === "locked"/);
  assert.match(workflow, /aria-label=\{t\("panel\.workflow\.history"\)\}/);
  assert.match(workflow, /WorkflowExecutionControls[^\n]*workflow=\{workflow\} run=\{selectedRun\}/);
  assert.doesNotMatch(workflow, /runSkill/);
  assert.match(tabs, /tab\.kind === "workflow"/);
});
