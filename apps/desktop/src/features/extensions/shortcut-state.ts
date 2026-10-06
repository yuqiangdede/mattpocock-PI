import { useSyncExternalStore } from "react";
import type { ShortcutConfiguration } from "@pi-desktop/shared";
import { api } from "../../lib/api";

type ShortcutState = { configuration: ShortcutConfiguration | null; error: string | null };
let state: ShortcutState = { configuration: null, error: null };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
function publish(next: ShortcutState) { state = next; listeners.forEach(listener => listener()); }
export function useShortcutConfiguration() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state, () => state);
}
export function loadShortcutConfiguration(): Promise<void> {
  if (!loading) loading = api.getShortcutConfiguration().then(configuration => publish({ configuration, error: null })).catch(error => publish({ ...state, error: String(error) })).finally(() => { loading = null; });
  return loading;
}
export async function saveShortcutConfiguration(configuration: ShortcutConfiguration): Promise<ShortcutConfiguration> {
  const saved = await api.saveShortcutConfiguration(configuration);
  publish({ configuration: saved, error: null });
  return saved;
}
let leaveGuard: (() => boolean) | null = null;
export function setShortcutLeaveGuard(guard: (() => boolean) | null) { leaveGuard = guard; }
export function canLeaveShortcutSettings(): boolean { return !leaveGuard || leaveGuard(); }

export async function restoreShortcutConfiguration(backupId?: string): Promise<ShortcutConfiguration> {
  const restored = await api.restoreShortcutConfiguration(backupId);
  publish({ configuration: restored, error: null });
  return restored;
}
