import type { NavigatorAnalysisCancelInput, NavigatorAnalysisInput, NavigatorAnalysisSnapshot, NavigatorAnalysisTarget } from "@pi-desktop/shared";

type State = { snapshot: NavigatorAnalysisSnapshot; pending: boolean; error: string | null; requestId: string | null };
type Backend = {
  listNavigatorAnalyses: (input: NavigatorAnalysisTarget) => Promise<NavigatorAnalysisSnapshot>;
  requestNavigatorAnalysis: (input: NavigatorAnalysisInput) => Promise<NavigatorAnalysisSnapshot>;
  cancelNavigatorAnalysis: (input: NavigatorAnalysisCancelInput) => Promise<NavigatorAnalysisSnapshot>;
};
/** The public navigation workflow owns UI freshness, not authoritative admission. */
export function createNavigatorAnalysisController(backend: Backend, publish: (state: State) => void) {
  let target: NavigatorAnalysisTarget | null = null;
  let revision = 0;
  let readRevision = 0;
  let state: State = { snapshot: { analyses: [] }, pending: false, error: null, requestId: null };
  const emit = () => publish({ ...state });
  const current = (token: number) => !!target && revision === token;
  return {
    async select(input: NavigatorAnalysisTarget) {
      target = input; const token = ++revision; const read = ++readRevision;
      state = { snapshot: { analyses: [] }, pending: false, error: null, requestId: null }; emit();
      try { const snapshot = await backend.listNavigatorAnalyses(input); if (current(token) && read === readRevision && !state.pending) { state.snapshot = snapshot; emit(); } }
      catch (cause) { if (current(token) && read === readRevision && !state.pending) { state.error = String(cause); emit(); } }
    },
    async refresh() {
      if (!target || state.pending) return;
      const token = revision; const read = ++readRevision; const input = { ...target };
      try {
        const snapshot = await backend.listNavigatorAnalyses(input);
        if (current(token) && read === readRevision && !state.pending) { state.snapshot = snapshot; emit(); }
      } catch (cause) {
        if (current(token) && read === readRevision && !state.pending) { state.error = String(cause); emit(); }
      }
    },
    async request(expectedVersion: number, selectedResultIds: string[]) {
      if (!target || state.pending) return;
      const token = revision; const input = { ...target, expectedVersion, selectedResultIds: [...selectedResultIds], requestId: crypto.randomUUID() };
      readRevision++;
      state.pending = true; state.error = null; state.requestId = input.requestId; emit();
      try { const snapshot = await backend.requestNavigatorAnalysis(input); if (current(token) && state.requestId === input.requestId) state.snapshot = snapshot; }
      catch (cause) { if (current(token) && state.requestId === input.requestId) state.error = String(cause); }
      finally { if (current(token) && state.requestId === input.requestId) { state.pending = false; state.requestId = null; emit(); } }
    },
    async cancel() {
      if (!target) return;
      const requestId = state.requestId ?? state.snapshot.analyses.find(item => item.status === "running")?.requestId;
      if (!requestId) return;
      const token = revision; readRevision++;
      try { const snapshot = await backend.cancelNavigatorAnalysis({ ...target, requestId }); if (current(token)) { state.snapshot = snapshot; state.pending = false; state.requestId = null; emit(); } }
      catch (cause) { if (current(token)) { state.error = String(cause); emit(); } }
    },
    dispose() { target = null; revision++; },
  };
}
