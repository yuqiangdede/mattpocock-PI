import { ErrorCodes, IPC, validateRequirementsRequest, type RequirementsTarget } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";

export function registerRequirementsIpc({ registrar, getHost, readFile }: {
  registrar: IpcRegistrar;
  getHost: () => Pick<HostProcess, "call"> | null;
  readFile: (path: string) => Promise<unknown>;
}) {
  const request = (input: unknown, kind: "history" | "preview" | "confirm") => {
    try { return validateRequirementsRequest(input, kind); }
    catch (cause) { throw Object.assign(cause instanceof Error ? cause : new Error(String(cause)), { errorCode: ErrorCodes.INVALID_ARGUMENT }); }
  };
  const host = () => {
    const owner = getHost();
    if (!owner) throw new Error("Requirements host unavailable");
    return owner;
  };
  registrar.handle(IPC.invoke.requirementsHistory, async (input: unknown) => host().call("requirements.history", request(input, "history")));
  for (const kind of ["preview", "confirm"] as const) {
    registrar.handle(kind === "preview" ? IPC.invoke.requirementsPreview : IPC.invoke.requirementsConfirm, async (input: unknown) => {
      const validated = request(input, kind);
      if (!("workspaceRoot" in validated)) throw new Error("Requirements file identity required");
      const target: RequirementsTarget = { projectGroupId: validated.projectGroupId, workspaceRoot: validated.workspaceRoot, relativePath: validated.relativePath };
      const owner = host();
      const resolved = await owner.call<{ path: string }>("requirements.resolve", target);
      // Keep current workspace, ignore and preview permissions at the existing file-reader boundary.
      await readFile(resolved.path);
      if (getHost() !== owner) throw new Error("Requirements host changed while checking file access");
      const current = await owner.call<{ path: string }>("requirements.resolve", target);
      if (current.path !== resolved.path) throw Object.assign(new Error("Requirements file changed while checking access"), { errorCode: ErrorCodes.CONFLICT });
      return owner.call(`requirements.${kind}`, validated);
    });
  }
}
