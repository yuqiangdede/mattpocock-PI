import { IPC, navigatorAnalysisInput, navigatorAnalysisTarget, navigatorAnalysisCancelInput } from "@pi-desktop/shared";
import type { IpcRegistrar } from "./types";
import type { HostProcess } from "../host-process";
import type { createNavigatorAnalysisService } from "../services/navigator-analysis";

export function registerNavigatorAnalysisIpc(registrar: IpcRegistrar, getHost: () => Pick<HostProcess, "call"> | null, service: ReturnType<typeof createNavigatorAnalysisService>) {
  registrar.handle(IPC.invoke.navigatorAnalysisList, async (input: unknown) => {
    const target = navigatorAnalysisTarget(input);
    const host = getHost();
    if (!host) throw new Error("Navigator host unavailable");
    return host.call("navigator.analysis.list", target);
  });
  registrar.handle(IPC.invoke.navigatorAnalysisRequest, async (input: unknown) => service.request(navigatorAnalysisInput(input)));
  registrar.handle(IPC.invoke.navigatorAnalysisCancel, async (input: unknown) => {
    const target = navigatorAnalysisTarget(input);
    await service.cancel(navigatorAnalysisCancelInput(input));
    const host = getHost();
    if (!host) throw new Error("Navigator host unavailable");
    return host.call("navigator.analysis.list", target);
  });
}
