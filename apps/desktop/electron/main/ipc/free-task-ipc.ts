import { IPC } from "@pi-desktop/shared";
import type { IpcRegistrar } from "./types";
import type { createFreeTaskService } from "../services/free-task-execution";
export function registerFreeTaskIpc(registrar: IpcRegistrar, service: ReturnType<typeof createFreeTaskService>) {
  registrar.handle(IPC.invoke.freeTaskStart, (input) => service.start(input));
  registrar.handle(IPC.invoke.freeTaskCheck, (input: { sessionId: string }) => service.check(input.sessionId));
  registrar.handle(IPC.invoke.freeTaskList, (input: { projectPath: string }) => service.list(input.projectPath));
  registrar.handle(IPC.invoke.freeTaskRead, (input: { id: string }) => service.read(input.id));
  registrar.handle(IPC.invoke.freeTaskStop, (input: { id: string }) => service.stop(input.id));
}
