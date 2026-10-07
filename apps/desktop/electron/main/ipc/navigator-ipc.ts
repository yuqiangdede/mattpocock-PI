import { IPC, navigatorSessionInput, navigatorVisibilityInput, navigatorControlInput } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";
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
  registrar.handle(IPC.invoke.navigatorList, async (input: unknown) => {
    const request = navigatorSessionInput(input);
    const host = getHost();
    if (!host) throw new Error("Navigator host unavailable");
    return host.call("navigator.list", request);
  });
}
