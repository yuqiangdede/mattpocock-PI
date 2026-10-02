import { ErrorCodes, IPC, WORKFLOW_STAGES, type WorkflowStageId } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";
import type { WorkflowExecutionService } from "../services/workflow-execution";

type WorkflowHost = Pick<HostProcess, "call">;

export function registerWorkflowIpc({
  registrar,
  getHost,
  execution,
}: {
  registrar: IpcRegistrar;
  getHost: () => WorkflowHost | null;
  execution?: WorkflowExecutionService;
}): void {
  registrar.handle(IPC.invoke.workflowStageReopen, async (input: { projectGroupId?: unknown; runId?: unknown; stageId?: unknown; expectedRevision?: unknown; confirmed?: unknown } = {}) => {
    const host = getHost();
    if (!host) throw new Error("host unavailable");
    if (typeof input.projectGroupId !== "string" || !input.projectGroupId.trim() || typeof input.runId !== "string" || !input.runId.trim() || typeof input.expectedRevision !== "number" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.confirmed !== true) throw invalidWorkflowInput("workflow identities, revision and explicit confirmation required");
    return host.call("workflow.stage.reopen", { projectGroupId: input.projectGroupId, runId: input.runId, stageId: requireStage(input.stageId), expectedRevision: input.expectedRevision, confirmed: true });
  });
  registrar.handle(IPC.invoke.workflowStageCheck, async (input: { projectGroupId?: unknown; runId?: unknown; sessionId?: unknown; stageId?: unknown } = {}) => {
    if (!execution) throw new Error("workflow execution service unavailable");
    return execution.check({ projectGroupId: typeof input.projectGroupId === "string" ? input.projectGroupId : "", runId: typeof input.runId === "string" ? input.runId : "", sessionId: typeof input.sessionId === "string" ? input.sessionId : "", stageId: requireStage(input.stageId) });
  });
  registrar.handle(IPC.invoke.workflowStageStart, async (input: { projectGroupId?: unknown; runId?: unknown; sessionId?: unknown; requestId?: unknown; expectedRevision?: unknown; stageId?: unknown; activeTicketId?: unknown } = {}) => {
    if (!execution) throw new Error("workflow execution service unavailable");
    if (typeof input.projectGroupId !== "string" || typeof input.runId !== "string" || typeof input.sessionId !== "string" || typeof input.requestId !== "string" || typeof input.expectedRevision !== "number" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || (input.activeTicketId !== undefined && typeof input.activeTicketId !== "string")) {
      throw invalidWorkflowInput("workflow identities and expected revision required");
    }
    return execution.start({ projectGroupId: input.projectGroupId, runId: input.runId, sessionId: input.sessionId, requestId: input.requestId, expectedRevision: input.expectedRevision, stageId: requireStage(input.stageId), ...(typeof input.activeTicketId === "string" ? { activeTicketId: input.activeTicketId } : {}) });
  });
  registrar.handle(IPC.invoke.workflowStageAccept, async (input: { projectGroupId?: unknown; runId?: unknown; stageId?: unknown; expectedRevision?: unknown } = {}) => {
    const host = getHost();
    if (!host) throw new Error("host unavailable");
    if (typeof input.projectGroupId !== "string" || !input.projectGroupId.trim() || typeof input.runId !== "string" || !input.runId.trim() || typeof input.expectedRevision !== "number" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw invalidWorkflowInput("workflow identities and expected revision required");
    return host.call("workflow.stage.accept", { projectGroupId: input.projectGroupId, runId: input.runId, stageId: requireStage(input.stageId), expectedRevision: input.expectedRevision });
  });
  registrar.handle(IPC.invoke.workflowExecutionStop, async (input: { executionId?: unknown } = {}) => {
    if (!execution || typeof input.executionId !== "string" || !input.executionId.trim()) {
      throw invalidWorkflowInput("workflow execution identity required");
    }
    return execution.stop(input.executionId);
  });
  registrar.handle(IPC.invoke.workflowDiscoveryCheck, async (input: { projectGroupId?: unknown; runId?: unknown; sessionId?: unknown } = {}) => {
    if (!execution) return { ready: false, skillId: "grill-with-docs", blocker: { code: "WORKFLOW_UNAVAILABLE", message: "workflow execution service unavailable" } };
    return execution.check({
      projectGroupId: typeof input.projectGroupId === "string" ? input.projectGroupId : "",
      runId: typeof input.runId === "string" ? input.runId : "",
      sessionId: typeof input.sessionId === "string" ? input.sessionId : "",
    });
  });
  registrar.handle(IPC.invoke.workflowDiscoveryStart, async (input: { projectGroupId?: unknown; runId?: unknown; sessionId?: unknown; requestId?: unknown; expectedRevision?: unknown } = {}) => {
    if (!execution) throw new Error("workflow execution service unavailable");
    if (typeof input.projectGroupId !== "string" || typeof input.runId !== "string" || typeof input.sessionId !== "string" || typeof input.requestId !== "string" || typeof input.expectedRevision !== "number" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw invalidWorkflowInput("workflow identities and expected revision required");
    }
    return execution.start({ projectGroupId: input.projectGroupId, runId: input.runId, sessionId: input.sessionId, requestId: input.requestId, expectedRevision: input.expectedRevision });
  });
  registrar.handle(IPC.invoke.workflowHistoryList, async () => {
    const host = getHost();
    if (!host) throw new Error("host unavailable");
    return host.call("workflow.history.list");
  });

  registrar.handle(
    IPC.invoke.workflowHistoryRead,
    async (input: { projectGroupId?: unknown } = {}) => {
      const host = getHost();
      if (!host) throw new Error("host unavailable");
      const projectGroupId = typeof input.projectGroupId === "string"
        ? input.projectGroupId.trim()
        : "";
      if (!projectGroupId) throw invalidWorkflowInput("project group id required");
      return host.call("workflow.history.read", { projectGroupId });
    },
  );

  registrar.handle(
    IPC.invoke.workflowRunCreate,
    async (
      input: { projectGroupId?: unknown; title?: unknown; expectedRevision?: unknown } = {},
    ) => {
      const host = getHost();
      if (!host) throw new Error("host unavailable");
      const projectGroupId = typeof input.projectGroupId === "string"
        ? input.projectGroupId.trim()
        : "";
      const title = typeof input.title === "string" ? input.title.trim() : "";
      const expectedRevision = input.expectedRevision;
      if (
        !projectGroupId
        || !title
        || typeof expectedRevision !== "number"
        || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 0
      ) {
        throw invalidWorkflowInput("project group id, run title, and revision required");
      }
      return host.call("workflow.run.create", { projectGroupId, title, expectedRevision });
    },
  );

  registrar.handle(
    IPC.invoke.workflowRunArchive,
    async (
      input: { projectGroupId?: unknown; runId?: unknown; expectedRevision?: unknown } = {},
    ) => {
      const host = getHost();
      if (!host) throw new Error("host unavailable");
      const projectGroupId = typeof input.projectGroupId === "string"
        ? input.projectGroupId.trim()
        : "";
      const runId = typeof input.runId === "string" ? input.runId.trim() : "";
      const expectedRevision = input.expectedRevision;
      if (
        !projectGroupId
        || !runId
        || typeof expectedRevision !== "number"
        || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 0
      ) {
        throw invalidWorkflowInput("project group id, run id, and revision required");
      }
      return host.call("workflow.run.archive", { projectGroupId, runId, expectedRevision });
    },
  );
}

function invalidWorkflowInput(message: string): Error & { errorCode: string } {
  return Object.assign(new Error(message), { errorCode: ErrorCodes.INVALID_ARGUMENT });
}

function requireStage(value: unknown): WorkflowStageId {
  const stage = WORKFLOW_STAGES.find((entry) => entry.id === value);
  if (!stage) throw invalidWorkflowInput("valid workflow stage required");
  return stage.id;
}
