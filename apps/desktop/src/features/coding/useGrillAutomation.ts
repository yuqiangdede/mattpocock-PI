import { useEffect, useState } from "react";
import { acceptGrillRecommendations, grillNavigation, type GrillState } from "./grill-workspace-model";

type AutomationOptions = {
  state: GrillState | null;
  canSend: boolean;
  busy: boolean;
  failed: boolean;
  retryExhausted: boolean;
  update: (state: GrillState) => void;
  submit: (state: GrillState, kind: "round" | "finish") => Promise<void>;
  invalidRecommendation: () => void;
};

/** Explicit panel-local consent; unmounting never leaves an automatic runner. */
export function useGrillAutomation(options: AutomationOptions) {
  const [enabled, setEnabled] = useState(false);
  const { state, canSend, busy, failed, retryExhausted, update, submit, invalidRecommendation } = options;
  useEffect(() => {
    if (!enabled || !state) return;
    if (!canSend || failed || state.finished || retryExhausted) {
      setEnabled(false);
      return;
    }
    if (state.pending || busy) return;
    const accepted = acceptGrillRecommendations(state);
    if (accepted !== state) {
      update(accepted);
      return;
    }
    if (state.questions.some(q => q.status !== "confirmed")) {
      setEnabled(false);
      invalidRecommendation();
      return;
    }
    const navigation = grillNavigation(state);
    if (navigation.finish) void submit(state, "finish");
    else if (navigation.next) void submit(state, "round");
  }, [enabled, state, canSend, busy, failed, retryExhausted, update, submit, invalidRecommendation]);
  return { enabled, toggle: () => setEnabled(value => !value) };
}
