import { useEffect, useRef, useState, type RefObject } from "react";
import type { TFunction } from "i18next";
import { formatCommandInsert } from "@pi-desktop/shared";
import { api } from "../../../../lib/api";
import type { ComposerFileReference } from "../model";

export function useComposerSkillShortcut(options: {
  draftKey: string;
  workspacePath: string;
  inputBlocked: boolean;
  composing: boolean;
  readLiveDraft: () => string;
  fileReferencesRef: RefObject<ComposerFileReference[]>;
  applyEditorDraft: (text: string, references: ComposerFileReference[], caret: number) => void;
  invalidatePromptEnhancement: () => void;
  t: TFunction;
}) {
  const latest = useRef(options);
  latest.current = options;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    inFlight.current = false;
    setPending(false);
    setError(null);
    return () => { generation.current += 1; };
  }, [options.draftKey, options.workspacePath]);

  const select = async (skill: string) => {
    const owner = latest.current;
    if (owner.inputBlocked || owner.composing || inFlight.current) return;
    const stamp = generation.current;
    const current = () => stamp === generation.current
      && owner.draftKey === latest.current.draftKey
      && owner.workspacePath === latest.current.workspacePath;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      // 复用斜杠菜单的技能目录，保留用户覆盖；异步返回后重新检查草稿归属。
      const { commands } = await api.composerCommands();
      if (!current()) return;
      const draft = latest.current;
      if (draft.inputBlocked || draft.composing) return;
      const command = commands.find((entry) => entry.kind === "skill" && entry.skillId === skill);
      if (!command) {
        setError(draft.t("coding.skillMissing"));
        return;
      }
      const text = formatCommandInsert(command.name) + draft.readLiveDraft();
      draft.invalidatePromptEnhancement();
      draft.applyEditorDraft(text, draft.fileReferencesRef.current, text.length);
    } catch (cause) {
      if (current()) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        setError(`${latest.current.t("coding.error")}: ${detail}`);
      }
    } finally {
      if (current()) { inFlight.current = false; setPending(false); }
    }
  };
  return { select, pending, error };
}
