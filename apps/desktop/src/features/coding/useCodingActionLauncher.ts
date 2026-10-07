import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodingActionError, ENGINEERING_SHORTCUTS, type CodingActionConfiguration } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";

import type { ComposerFileReference } from "../chat/composer/model";
import { getCodingActions, loadCodingActions } from "../extensions/coding-action-state";
import { CodingActionContextError, executeCodingAction } from "./execute-coding-action";
import { registerComposerPreparation } from "./composer-preparation-bridge";
export function useCodingActionLauncher(options: {
  sessionId: string | null | undefined; projectPath: string; blocked: boolean; draftKey: string;
  readLiveDraft: () => string;
  invalidatePromptEnhancement: () => void;
  fileReferencesRef: { current: ComposerFileReference[] };
  applyEditorDraft: (text: string, references: ComposerFileReference[], caret: number) => void;
}) {
  const { t } = useTranslation();
  const latest = useRef(options); latest.current = options;
  const generation = useRef(0), inFlight = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { generation.current += 1; inFlight.current = false; setPending(false); setError(null); return () => { generation.current += 1; }; }, [options.draftKey, options.sessionId, options.projectPath]);
  const select = async (target: { actionId: string } | { skillId: string; prompt?: string }) => {
    const owner = latest.current;
    if (owner.blocked || inFlight.current) return false;
    owner.invalidatePromptEnhancement();
    const stamp = generation.current;
    const current = () => {
      const state = useAppStore.getState();
      return stamp === generation.current && owner.draftKey === latest.current.draftKey && owner.sessionId === latest.current.sessionId && owner.projectPath === latest.current.projectPath && (owner.sessionId ?? "") === (state.activeSessionId ?? "") && owner.projectPath === (state.workspace?.path ?? "");
    };
    inFlight.current = true; setPending(true); setError(null);
    try {
      await loadCodingActions();
      const configuration: CodingActionConfiguration = "actionId" in target ? getCodingActions() : { schemaVersion: 1, actions: [{ id: "selected-skill", label: target.skillId, skillId: target.skillId, ...(target.prompt === undefined ? {} : { prompt: target.prompt }) }] };
      const actionId = "actionId" in target ? target.actionId : "selected-skill";
      await executeCodingAction(actionId, {
        sessionId: owner.sessionId ?? "", projectPath: owner.projectPath, configuration,
        catalog: async () => (await api.composerCommands()).commands, isCurrent: () => current() && !latest.current.blocked,
        defaultPrompt: skillId => {
          const shortcut = ENGINEERING_SHORTCUTS.find(entry => entry.skill === skillId);
          return shortcut ? t(`coding.prompts.${shortcut.action}`) : "";
        },
        readLiveDraft: () => latest.current.readLiveDraft(),
        applyDraft: text => {
          const draft = latest.current;
          draft.invalidatePromptEnhancement();
          draft.applyEditorDraft(text, draft.fileReferencesRef.current, text.length);
        },
      });
      return current() && !latest.current.blocked;
    } catch (cause) { if (current()) setError(cause instanceof CodingActionContextError ? t(`codingActions.${cause.code}`) : cause instanceof CodingActionError ? t(`codingActions.${cause.code === "SKILL_MISSING" ? "skillMissing" : cause.code}`, { skillId: "skillId" in target ? target.skillId : getCodingActions().actions.find(action => action.id === target.actionId)?.skillId }) : t("codingActions.executeFailed", { detail: cause instanceof Error ? cause.message : String(cause) })); }
    finally { if (current()) { inFlight.current = false; setPending(false); } }
    return false;
  };
  useEffect(() => registerComposerPreparation(request => {
    const owner = latest.current;
    if (request.sessionId !== owner.sessionId || request.projectPath !== owner.projectPath) return Promise.resolve(false);
    return select({ skillId: request.skillId, prompt: request.prompt });
  }), [options.draftKey, options.sessionId, options.projectPath]);
  return { execute: (actionId: string) => select({ actionId }), selectSkill: (skillId: string) => select({ skillId }), pending, error };
}
