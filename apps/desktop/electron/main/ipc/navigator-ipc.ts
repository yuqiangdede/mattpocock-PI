import { IPC, navigatorSessionInput } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";
export function registerNavigatorIpc(registrar: IpcRegistrar, getHost: () => Pick<HostProcess, "call"> | null) {
  registrar.handle(IPC.invoke.navigatorList, async (input: unknown) => {
    const request = navigatorSessionInput(input);
    const host = getHost();
    if (!host) throw new Error("Navigator host unavailable");
    return host.call("navigator.list", request);
  });
}
