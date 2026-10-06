import { useSyncExternalStore } from "react";
import { createDefaultCodingActions, type CodingActionConfiguration, type CodingActionSnapshot } from "@pi-desktop/shared";
import { api } from "../../lib/api";
type State = CodingActionSnapshot & { loaded: boolean };
let state: State = { configuration: createDefaultCodingActions(), loaded: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
function publish(next: State) { state = next; listeners.forEach(listener => listener()); }
export function useCodingActions() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state, () => state);
}
export function getCodingActions(): CodingActionConfiguration { return state.configuration; }
export function loadCodingActions(force = false): Promise<void> {
  if (state.loaded && !force) return Promise.resolve();
  if (!loading) loading = api.getCodingActions().then(snapshot => publish({ ...snapshot, loaded: true }))
    .catch(cause => publish({ ...state, loaded: true, diagnostic: String(cause) }))
    .finally(() => { loading = null; });
  return loading;
}
export async function saveCodingActions(configuration: CodingActionConfiguration, recover = false): Promise<void> {
  const saved = await api.saveCodingActions(configuration, recover);
  publish({ configuration: saved, loaded: true });
}
export async function resetCodingActions(): Promise<void> {
  const configuration = await api.resetCodingActions();
  publish({ configuration, loaded: true });
}
let leaveGuard: (() => boolean) | null = null;
export function setCodingActionLeaveGuard(guard: (() => boolean) | null) { leaveGuard = guard; }
export function canLeaveCodingActionSettings(): boolean { return !leaveGuard || leaveGuard(); }
