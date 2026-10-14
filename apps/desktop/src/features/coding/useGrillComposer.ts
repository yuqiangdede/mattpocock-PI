import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppState } from "../../stores/app-state";
import { startGrillFromComposer } from "./grill-composer-start";
import { loadGrill } from "./grill-workspace-model";

export function useGrillComposer(send: AppState["sendPrompt"], draftKey: string, storageError: () => void, sessionId?: string | null) {
  const { t } = useTranslation();
  const [preparing, setPreparing] = useState(false);
  const [visualStart, setVisualStart] = useState<{sessionId: string; requestId: string} | null>(null);
  useEffect(() => { setPreparing(false); }, [draftKey]);
  const sendPrompt: AppState["sendPrompt"] = (...args) => preparing
    ? startGrillFromComposer(send, args, (sessionId, requestId) => {
      setPreparing(false); setVisualStart({ sessionId, requestId });
    }, storageError) : send(...args);
  return { preparing, visualStart, sendPrompt, prepare: () => setPreparing(true), cancel: () => setPreparing(false),
    canResume: Boolean(sessionId && loadGrill(sessionId)), resume: () => {
      if (!sessionId || !loadGrill(sessionId)) return;
      setPreparing(false); setVisualStart({sessionId, requestId:crypto.randomUUID()});
    },
    hint: t("codingActions.visualTopicHint") };
}
