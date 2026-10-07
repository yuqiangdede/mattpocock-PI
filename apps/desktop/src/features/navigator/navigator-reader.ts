import type { NavigatorSnapshot } from "@pi-desktop/shared";

/** Late reads cannot update a newly selected conversation or an unmounted panel. */
export function createNavigatorReader(
  read: (sessionId: string) => Promise<NavigatorSnapshot>,
  publish: (snapshot: NavigatorSnapshot | null, error: string | null) => void,
) {
  let sessionId: string | undefined;
  let revision = 0;
  return {
    select(id: string | undefined) {
      sessionId = id;
      revision += 1;
      publish(null, null);
    },
    async refresh() {
      const selected = sessionId;
      const token = ++revision;
      if (!selected) return;
      try {
        const snapshot = await read(selected);
        if (token === revision && sessionId === selected) publish(snapshot, null);
      } catch (cause) {
        if (token === revision && sessionId === selected) publish(null, String(cause));
      }
    },
    dispose() { sessionId = undefined; revision += 1; },
  };
}
