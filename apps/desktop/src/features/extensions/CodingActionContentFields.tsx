import { ENGINEERING_SHORTCUTS, type CodingAction, type ComposerCommand } from "@pi-desktop/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button, Field, Textarea } from "../../components/ui";
import { codingShortcutDescription } from "../coding/coding-shortcut-tooltip";

type Props = {
  action: CodingAction;
  catalog: ComposerCommand[];
  disabled: boolean;
  onChange: (patch: Partial<CodingAction>) => void;
};

export function CodingActionContentFields(props: Props) {
  const { t } = useTranslation();
  return <CodingActionContentView {...props} t={t} />;
}

export function CodingActionContentView({ action, catalog, disabled, onChange, t }: Props & { t: TFunction }) {
  const entry = ENGINEERING_SHORTCUTS.find(item => item.skill === action.skillId);
  const defaultPrompt = entry ? t(`coding.prompts.${entry.action}`) : "";
  const usesDefault = action.prompt == null;
  const promptStatus = usesDefault ? (defaultPrompt ? "promptDefault" : "promptNone") : action.prompt === "" ? "promptEmpty" : "promptCustom";
  const description = codingShortcutDescription({ action, configured: true }, catalog, t);
  return <>
    <Field label={t("codingActions.descriptionLabel")} hint={t("codingActions.descriptionHint")}>
      <Textarea aria-label={t("codingActions.descriptionAria")} value={action.description || description} disabled={disabled} maxLength={4000} onChange={event => onChange({ description: event.target.value })} />
    </Field>
    <Field label={t("codingActions.prompt")} hint={t("codingActions.promptHint")}>
      <div role="status">{t(`codingActions.${promptStatus}`)}</div>
      <Textarea aria-label={t("codingActions.prompt")} value={action.prompt ?? defaultPrompt} disabled={disabled} maxLength={16000} onChange={event => onChange({ prompt: event.target.value })} />
      <Button disabled={disabled || usesDefault} onClick={() => onChange({ prompt: null })}>{t("codingActions.restoreDefaultPrompt")}</Button>
    </Field>
  </>;
}
