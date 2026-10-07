import { IPC, navigatorSessionInput, navigatorVisibilityInput, navigatorControlInput, navigatorResultInput } from "@pi-desktop/shared";

import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";
import { readOpenableFile } from "@pi-desktop/host-runtime";
import type { NavigatorResultSnapshot, SessionDetail } from "@pi-desktop/shared";
export function registerNavigatorIpc(registrar: IpcRegistrar, getHost: () => Pick<HostProcess, "call"> | null) {
  registrar.handle(IPC.invoke.navigatorSetHidden, async (input: unknown) => {
    const request = navigatorVisibilityInput(input);
    const host = getHost();
    if (!host) throw new Error("Navigator host unavailable");
    return host.call("navigator.setHidden", request);
  });
  registrar.handle(IPC.invoke.navigatorControl, async (input: unknown) => {
    const request = navigatorControlInput(input);
    const host = getHost();
    if (!host) throw new Error("Navigator host unavailable");
    return host.call("navigator.control", request);
  });
  registrar.handle(IPC.invoke.navigatorReadResult, async (input: unknown) => {
    const request = navigatorResultInput(input);
    const host = getHost();
    if (!host) throw new Error("Navigator host unavailable");
    const snapshot = await host.call<NavigatorResultSnapshot>("navigator.results", request);
    const result = snapshot.results.find(item => item.id === request.resultId && item.kind === "file");
    if (!result?.path) throw new Error("File association unavailable");
    const response = await host.call<{ session: SessionDetail | null }>("session.get", { id: request.sessionId, messageLimit: 1 });
    if (!response.session?.projectPath) throw new Error("Activity project unavailable");
    const file = await readOpenableFile(result.path, response.session.projectPath, []);
    const fresh = await host.call<NavigatorResultSnapshot>("navigator.results", request);
    if (!fresh.results.some(item => item.id === result.id && item.path === result.path)) throw new Error("File association changed while reading");
    return file;
  });
  for (const [channel, method] of [[IPC.invoke.navigatorResults, "navigator.results"], [IPC.invoke.navigatorAddResult, "navigator.addResult"], [IPC.invoke.navigatorRemoveResult, "navigator.removeResult"]] as const) {
    registrar.handle(channel, async (input: unknown) => {
      const request = navigatorResultInput(input);
      const host = getHost();
      if (!host) throw new Error("Navigator host unavailable");
      return host.call(method, request);
    });
  }
  registrar.handle(IPC.invoke.navigatorList, async (input: unknown) => {
    const request = navigatorSessionInput(input);
    const host = getHost();
    if (!host) throw new Error("Navigator host unavailable");
    return host.call("navigator.list", request);
  });
}
