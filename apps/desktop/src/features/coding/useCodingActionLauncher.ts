import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodingActionError, ENGINEERING_SHORTCUTS, type CodingActionConfiguration } from "@pi-desktop/shared";
import { api } from "../../lib/api";

import type { ComposerFileReference } from "../chat/composer/model";
import { getCodingActions, loadCodingActions } from "../extensions/coding-action-state";
import { CodingActionContextError, executeCodingAction } from "./execute-coding-action";
import { preparePromptAction } from "./prepare-prompt-action";
import { INTERACTION_IMAGE_PROMPT_ID, interactionImagePrompt } from "./interaction-image-prompt";
import { buildCommitCodeDraft } from "./commit-code-draft";
import { visualGrillingDefaultPrompt } from "./visual-grilling-prompt";
import { REVIEW_FIX_PROMPT_ID, reviewFixPrompt } from "./review-fix-prompt";
import { documentPromptKey } from "./document-shortcuts";

export function useCodingActionLauncher(options: {
  sessionId: string | null | undefined; projectPath: string; blocked: boolean; draftKey: string;
  readLiveDraft: () => string;
  invalidatePromptEnhancement: () => void;
  fileReferencesRef: { current: ComposerFileReference[] };
  applyEditorDraft: (text: string, references: ComposerFileReference[], caret: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const latest = useRef(options); latest.current = options;
  const generation = useRef(0), inFlight = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { generation.current += 1; inFlight.current = false; setPending(false); setError(null); return () => { generation.current += 1; }; }, [options.draftKey, options.sessionId, options.projectPath]);
  const select = async (target: { actionId: string } | { skillId: string }, context = "") => {
    const owner = latest.current;
    if (owner.blocked || inFlight.current) return;
    owner.invalidatePromptEnhancement();
    const stamp = generation.current;
    const current = () => stamp === generation.current && owner.draftKey === latest.current.draftKey && owner.sessionId === latest.current.sessionId && owner.projectPath === latest.current.projectPath;
    inFlight.current = true; setPending(true); setError(null);
    try {
      await loadCodingActions();
      const configuration: CodingActionConfiguration = "actionId" in target ? getCodingActions() : { schemaVersion: 1, actions: [{ id: "selected-skill", label: target.skillId, skillId: target.skillId }] };
      const actionId = "actionId" in target ? target.actionId : "selected-skill";
      await executeCodingAction(actionId, {
        sessionId: owner.sessionId ?? "", projectPath: owner.projectPath, configuration,
        catalog: async () => (await api.composerCommands()).commands, isCurrent: () => current() && !latest.current.blocked,
        defaultPrompt: skillId => {
          if (skillId === "grill-with-ui") return visualGrillingDefaultPrompt(i18n.resolvedLanguage ?? i18n.language);
          const documentKey = documentPromptKey(skillId);
          if (documentKey) return t(documentKey);
          const shortcut = ENGINEERING_SHORTCUTS.find(entry => entry.skill === skillId);
          return shortcut ? t(`coding.prompts.${shortcut.action}`) : "";
        },
        readLiveDraft: () => [context, latest.current.readLiveDraft()].filter(Boolean).join("\n\n"),
        applyDraft: text => {
          const draft = latest.current;
          draft.invalidatePromptEnhancement();
          const guarded = `${text}\n\n${t("codingActions.noCompilePrompt")}`;
          draft.applyEditorDraft(guarded, draft.fileReferencesRef.current, guarded.length);
        },
      });
    } catch (cause) { if (current()) setError(cause instanceof CodingActionContextError ? t(`codingActions.${cause.code}`) : cause instanceof CodingActionError ? t(`codingActions.${cause.code === "SKILL_MISSING" ? "skillMissing" : cause.code}`, { skillId: "skillId" in target ? target.skillId : getCodingActions().actions.find(action => action.id === target.actionId)?.skillId }) : t("codingActions.executeFailed", { detail: cause instanceof Error ? cause.message : String(cause) })); }
    finally { if (current()) { inFlight.current = false; setPending(false); } }
  };
  const selectPrompt = (id: string, context = "") => {
    const owner = latest.current;
    if (owner.blocked || inFlight.current) return;
    owner.invalidatePromptEnhancement();
    try {
      if (id === "compile-project" || id === "continue-task" || id === INTERACTION_IMAGE_PROMPT_ID || id === REVIEW_FIX_PROMPT_ID) {
        const language = i18n.resolvedLanguage ?? i18n.language;
        const prompt = id === "continue-task" ? t("codingActions.continuePrompt") : id === "compile-project" ? t("codingActions.compilePrompt") : id === REVIEW_FIX_PROMPT_ID ? reviewFixPrompt(language) : interactionImagePrompt(language);
        const handoff = id === REVIEW_FIX_PROMPT_ID ? [t("codingActions.reviewFixSummaryContext"), context].filter(Boolean).join("\n\n") : context;
        const text = buildCommitCodeDraft(id === "compile-project" ? prompt : `${prompt}\n\n${t("codingActions.noCompilePrompt")}`, [handoff, owner.readLiveDraft()].filter(Boolean).join("\n\n"));
        owner.applyEditorDraft(text, owner.fileReferencesRef.current, text.length);
        setError(null);
        return;
      }
      preparePromptAction(id, { configuration: getCodingActions(), commitPrompt: t("codingActions.commitPrompt"),
        readLiveDraft: () => [context, owner.readLiveDraft()].filter(Boolean).join("\n\n"),
        applyDraft: text => { const guarded = `${text}\n\n${t("codingActions.noCompilePrompt")}`; owner.applyEditorDraft(guarded, owner.fileReferencesRef.current, guarded.length); },
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof CodingActionError ? t(`codingActions.${cause.code}`) : t("codingActions.executeFailed", { detail: String(cause) }));
    }
  };
  return { execute: (actionId: string) => select({ actionId }), selectSkill: (skillId: string, context?: string) => select({ skillId }, context), selectPrompt, pending, error };
}
