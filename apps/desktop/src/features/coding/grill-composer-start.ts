import type { AppState } from "../../stores/app-state";
import { grillPrompt, newGrill, saveGrill } from "./grill-workspace-model";

/** Adapt the existing native send path; Session admission remains owned by the store. */
export async function startGrillFromComposer(send: AppState["sendPrompt"],
  args: Parameters<AppState["sendPrompt"]>,
  onStarted: (sessionId: string, requestId: string) => void,
  onStorageError: () => void) {
  const [content, draft, requestedSessionId, onAccepted] = args;
  const topic = (draft?.text ?? content).trim();
  if (!topic) return false;
  const state = newGrill(requestedSessionId ?? "", topic);
  const operation = { id: crypto.randomUUID(), kind: "round" as const, text: "", submittedAt: new Date().toISOString() };
  state.pending = operation;
  return send(grillPrompt(state, operation) + "\n\n" + content, draft, requestedSessionId, sessionId => {
    if (!saveGrill({ ...state, sessionId })) onStorageError();
    else onStarted(sessionId, operation.id);
    onAccepted?.(sessionId);
  });
}
