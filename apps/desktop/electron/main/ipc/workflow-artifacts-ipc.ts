import { ErrorCodes, IPC, type WorkflowArtifactOpen } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";

function identity(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw Object.assign(new Error("Workflow reference identity required"), { errorCode: ErrorCodes.INVALID_ARGUMENT });
  return value;
}

export function registerWorkflowArtifactsIpc({ registrar, getHost, readFile }: {
  registrar: IpcRegistrar;
  getHost: () => Pick<HostProcess, "call"> | null;
  readFile: (path: string) => Promise<unknown>;
}) {
  const host = () => {
    const value = getHost();
    if (!value) throw new Error("workflow host unavailable");
    return value;
  };
  registrar.handle(IPC.invoke.workflowArtifactRegister, async (input: unknown) => {
    // Host owns the complete schema, revision and root association validation.
    if (!input || typeof input !== "object") throw Object.assign(new Error("Workflow reference data required"), { errorCode: ErrorCodes.INVALID_ARGUMENT });
    for (const [revision, minimum] of [["stageRevision" in input ? input.stageRevision : undefined, 1], ["expectedRevision" in input ? input.expectedRevision : undefined, 0]] as const) {
      if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < minimum) throw Object.assign(new Error("Workflow reference safe revision required"), { errorCode: ErrorCodes.INVALID_ARGUMENT });
    }
    return host().call("workflow.artifact.register", input);
  });
  registrar.handle(IPC.invoke.workflowArtifactList, async (input: { projectGroupId?: unknown; runId?: unknown } = {}) =>
    host().call("workflow.artifact.list", { projectGroupId: identity(input.projectGroupId), runId: identity(input.runId) }));
  registrar.handle(IPC.invoke.workflowArtifactOpen, async (input: { projectGroupId?: unknown; runId?: unknown; referenceId?: unknown } = {}) => {
    const owner = host();
    const request = { projectGroupId: identity(input.projectGroupId), runId: identity(input.runId), referenceId: identity(input.referenceId) };
    const resolved = await owner.call<WorkflowArtifactOpen>("workflow.artifact.resolve", request);
    if (!resolved.path) return resolved;
    // Invoke the existing UI file reader: current workspace/registered roots,
    // realpath containment, ignore rules and preview limits stay authoritative.
    await readFile(resolved.path);
    if (getHost() !== owner) throw new Error("workflow host changed during reference opening");
    const current = await owner.call<WorkflowArtifactOpen>("workflow.artifact.resolve", request);
    if (current.path !== resolved.path) throw Object.assign(new Error("Workflow reference changed during opening"), { errorCode: ErrorCodes.CONFLICT });
    return current;
  });
}
