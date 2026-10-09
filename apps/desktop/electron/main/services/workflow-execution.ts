import {
  isRpcTimeoutError,
  type AgentPromptRequest,
  type AgentPromptResponse,
  type ComposerCommand,
  type WorkflowAdmission,
  type WorkflowDiscoveryRequest,
  type WorkflowDiscoveryStatus,
  WORKFLOW_STAGES,
} from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { Logger } from "../logger";

type WorkflowHost = Pick<HostProcess, "call">;
export type WorkflowExecutionService = {
  check(input: Pick<WorkflowDiscoveryRequest, "projectGroupId" | "runId" | "sessionId" | "stageId">): Promise<WorkflowDiscoveryStatus>;
  start(input: WorkflowDiscoveryRequest): Promise<WorkflowAdmission>;
  stop(executionId: string): Promise<{ history: import("@pi-desktop/shared").WorkflowProjectHistory }>;
};

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const value = error as { errorCode?: unknown; code?: unknown; data?: { errorCode?: unknown } };
    const code = value.data?.errorCode ?? value.errorCode ?? value.code;
    if (typeof code === "string") return code;
  }
  return "WORKFLOW_UNAVAILABLE";
}

export function createWorkflowExecutionService({
  getHost,
  catalog,
  submit,
  cancel,
  logger,
  onIdle,
}: {
  getHost: () => WorkflowHost | null;
  catalog: (projectPath: string) => Promise<ComposerCommand[]>;
  submit: (input: AgentPromptRequest) => Promise<AgentPromptResponse>;
  cancel: (input: { sessionId: string; turnId: string; workflowExecutionId: string }) => Promise<unknown>;
  logger: Pick<Logger, "app">;
  onIdle?: (sessionId: string) => void;
}): WorkflowExecutionService {
  const requireHost = () => {
    const host = getHost();
    if (!host) throw Object.assign(new Error("Workflow host is unavailable"), { errorCode: "WORKFLOW_UNAVAILABLE" });
    return host;
  };
  const requireSkill = async (path: string, skillId: string) => {
    const commands = await catalog(path);
    if (!commands.some((command) => command.kind === "skill" && command.skillId === skillId)) {
      throw Object.assign(new Error(`The installed ${skillId} skill is unavailable`), { errorCode: "WORKFLOW_SKILL_UNAVAILABLE" });
    }
  };
  const check = async (input: Pick<WorkflowDiscoveryRequest, "projectGroupId" | "runId" | "sessionId" | "stageId">): Promise<WorkflowDiscoveryStatus> => {
    const stageId = input.stageId ?? "discovery";
    const skillId = WORKFLOW_STAGES.find((stage) => stage.id === stageId)?.skillId ?? "grill-with-docs";
    try {
      const context = await requireHost().call<{ projectPath: string; skillId: string }>("workflow.stage.check", { ...input, stageId });
      await requireSkill(context.projectPath, context.skillId);
      return { ready: true, skillId };
    } catch (error) {
      return { ready: false, skillId, blocker: { code: errorCode(error), message: error instanceof Error ? error.message : String(error) } };
    }
  };
  const dispatch = async (host: WorkflowHost, admission: WorkflowAdmission) => {
    try {
      const execution = admission.execution;
      const context = await host.call<{ projectPath: string; prompt: string; skillId: string }>("workflow.execution.context", {
        executionId: execution.id, sessionId: execution.sessionId,
      });
      await requireSkill(context.projectPath, context.skillId);
      if (getHost() !== host) throw Object.assign(new Error("Workflow host changed before dispatch"), { errorCode: "WORKFLOW_INTERRUPTED" });
      await submit({ sessionId: execution.sessionId, content: context.prompt, workflowExecutionId: execution.id });
    } catch (error) {
      try {
        const result = await host.call<{ history: import("@pi-desktop/shared").WorkflowProjectHistory }>("workflow.execution.reconcile", {
          executionId: admission.execution.id,
          ...(isRpcTimeoutError(error) ? {} : { rejectionCode: errorCode(error) }),
        });
        const execution = result.history.runs.flatMap((run) => run.executions).find((attempt) => attempt.id === admission.execution.id);
        if (execution && execution.phase !== "pending" && execution.phase !== "running") onIdle?.(execution.sessionId);
      } catch (persistenceError) {
        logger.app("session", "error", "workflow dispatch reconciliation failed", { data: String(persistenceError) });
      }
      logger.app("session", "warn", "workflow dispatch did not acknowledge normally", { data: { executionId: admission.execution.id, errorCode: errorCode(error), error: error instanceof Error ? error.message : String(error) } });
    }
  };
  return {
    check,
    async stop(executionId) {
      const host = requireHost();
      const target = await host.call<{ sessionId: string; turnId?: string | null }>("workflow.execution.stop", { executionId });
      if (target.turnId) {
        await cancel({ sessionId: target.sessionId, turnId: target.turnId, workflowExecutionId: executionId });
      }
      const result = await host.call<{ history: import("@pi-desktop/shared").WorkflowProjectHistory }>("workflow.execution.reconcile", { executionId });
      const execution = result.history.runs.flatMap((run) => run.executions).find((attempt) => attempt.id === executionId);
      if (execution && execution.phase !== "pending" && execution.phase !== "running") onIdle?.(execution.sessionId);
      return result;
    },
    async start(input) {
      const host = requireHost();
      const readiness = await check(input);
      if (!readiness.ready) throw Object.assign(new Error(readiness.blocker?.message ?? "Workflow is unavailable"), { errorCode: readiness.blocker?.code });
      const admission = await host.call<WorkflowAdmission>("workflow.stage.reserve", { ...input, stageId: input.stageId ?? "discovery" });
      if (admission.newReservation) {
        void dispatch(host, admission).catch((error) => {
          logger.app("session", "error", "unexpected workflow dispatch failure", { data: String(error) });
        });
      }
      return admission;
    },
  };
}
