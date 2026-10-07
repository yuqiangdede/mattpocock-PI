/** Conversation-owned visibility commands never dispatch a turn or remove source data. */
export function createNavigatorHistory(
  write: (sessionId: string, activityId: string, hidden: boolean) => Promise<unknown>,
  changed: () => void,
  failed: (error: string) => void,
) {
  let sessionId: string | undefined;
  let revision = 0;
  let pending = false;
  return {
    select(id: string | undefined) { sessionId = id; revision++; pending = false; },
    async setHidden(activityId: string, hidden: boolean) {
      if (!sessionId || pending) return;
      const selected = sessionId; const token = revision; pending = true;
      try {
        await write(selected, activityId, hidden);
        if (token === revision && selected === sessionId) changed();
      } catch (cause) {
        if (token === revision && selected === sessionId) failed(String(cause));
      } finally { if (token === revision) pending = false; }
    },
    dispose() { sessionId = undefined; revision++; pending = false; },
  };
}
