import type { AgentPromptRequest, AgentPromptResponse, ComposerCommand, FreeTask, FreeTaskRequest } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";

export function createFreeTaskService({ getHost, catalog, submit, cancel, onIdle }: {
  getHost: () => Pick<HostProcess, "call"> | null;
  catalog: (path: string) => Promise<ComposerCommand[]>;
  submit: (request: AgentPromptRequest) => Promise<AgentPromptResponse>;
  cancel: (request: { sessionId: string; turnId: string; freeTaskId: string }) => Promise<unknown>;
  onIdle?: (sessionId: string) => void;
}) {
  const host = () => { const value = getHost(); if (!value) throw new Error("Host unavailable"); return value; };
  const read = (id: string) => host().call<FreeTask>("freeTask.read", { id });
  const inFlight = new Map<string, Promise<FreeTask>>();
  return {
    read,
    check: (sessionId: string) => host().call<{ busy: boolean }>("freeTask.check", { sessionId }),
    list: (projectPath: string) => host().call<{ tasks: FreeTask[] }>("freeTask.list", { projectPath }),
    async start(input: FreeTaskRequest): Promise<FreeTask> {
      const existing = inFlight.get(input.requestId);
      if (existing) return existing;
      const operation = (async () => {
        const boundary = host();
        const task = await boundary.call<FreeTask>("freeTask.reserve", input);
        if (task.phase !== "pending" || task.turnId) return task;
        try {
          const context = await boundary.call<{ projectPath: string; skillId: string; prompt: string }>("freeTask.context", { id: task.id, sessionId: task.sessionId });
          const commands = await catalog(context.projectPath);
          if (!commands.some((command) => command.kind === "skill" && command.name === context.skillId && command.skillId === context.skillId)) {
            throw Object.assign(new Error(`Skill unavailable: ${context.skillId}`), { errorCode: "FREE_TASK_SKILL_UNAVAILABLE" });
          }
          if (getHost() !== boundary) throw new Error("Host changed before dispatch");
          await submit({ sessionId: task.sessionId, content: context.prompt, freeTaskId: task.id });
          return read(task.id);
        } catch (error) {
          // Only retire an unbound reservation. A bound turn may still execute
          // after a transport timeout, and must settle through its own lifecycle.
          const rejected = await boundary.call<FreeTask>("freeTask.reject", { id: task.id, error: error instanceof Error ? error.message : String(error) });
          if (rejected.phase !== "pending" && rejected.phase !== "running") onIdle?.(task.sessionId);
          throw error;
        }
      })();
      inFlight.set(input.requestId, operation);
      try { return await operation; } finally { inFlight.delete(input.requestId); }
    },
    async stop(id: string) {
      const task = await read(id);
      if (task.turnId && (task.phase === "running" || task.phase === "pending")) {
        const result = await cancel({ sessionId: task.sessionId, turnId: task.turnId, freeTaskId: id });
        if (result && typeof result === "object" && (("aborted" in result && result.aborted === false) || ("ok" in result && result.ok === false))) throw new Error("Task cancellation was not acknowledged");
      } else if (task.phase === "pending" || task.phase === "waiting") {
        await host().call("freeTask.reject", { id, error: "Cancelled before admission" });
      }
      return read(id);
    },
  };
}
