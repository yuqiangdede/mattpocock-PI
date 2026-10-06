import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import type { ComposerDraftController } from "../chat/composer/hooks/useComposerDraft";
import { getCodingActions, loadCodingActions } from "../extensions/coding-action-state";
import { executeCodingAction } from "./execute-coding-action";
export function useCodingActionLauncher(options: {
  sessionId: string | null | undefined; projectPath: string; blocked: boolean; draftKey: string;
  readLiveDraft: () => string;
  invalidatePromptEnhancement: () => void;
  draft: Pick<ComposerDraftController, "draftSnapshot" | "draftRevision" | "clearDraftForKey">;
}) {
  const latest = useRef(options); latest.current = options;
  const generation = useRef(0), inFlight = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { generation.current += 1; inFlight.current = false; setPending(false); setError(null); }, [options.sessionId, options.projectPath]);
  const execute = async (actionId: string) => {
    const owner = latest.current;
    if (owner.blocked || inFlight.current) return;
    owner.invalidatePromptEnhancement();
    const stamp = generation.current;
    const current = () => stamp === generation.current && owner.sessionId === latest.current.sessionId && owner.projectPath === latest.current.projectPath;
    inFlight.current = true; setPending(true); setError(null);
    const snapshot = owner.draft.draftSnapshot(owner.readLiveDraft());
    const revision = owner.draft.draftRevision(owner.draftKey);
    try {
      await loadCodingActions();
      const accepted = await executeCodingAction(actionId, {
        sessionId: owner.sessionId ?? "", projectPath: owner.projectPath, configuration: getCodingActions(),
        catalog: async () => (await api.composerCommands()).commands, isCurrent: () => current() && !latest.current.blocked,
        draft: snapshot, send: (content, submitted, sessionId) => useAppStore.getState().sendPrompt(content, submitted, sessionId),
      });
      if (accepted) owner.draft.clearDraftForKey(owner.draftKey, revision, snapshot);
      else if (current()) setError("当前会话未接收 Action；请检查模型、权限或现有会话状态。");
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (current()) { inFlight.current = false; setPending(false); } }
  };
  return { execute, pending, error };
}
