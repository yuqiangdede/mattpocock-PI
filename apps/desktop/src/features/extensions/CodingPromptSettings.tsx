import { useState } from "react";
import { codingPromptActions, type CodingActionConfiguration, type CodingPromptAction } from "@pi-desktop/shared";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button, Checkbox, Field, Input, Textarea } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";

type Props = {
  configuration: CodingActionConfiguration;
  disabled: boolean;
  onChange: (configuration: CodingActionConfiguration) => void;
};

export function CodingPromptSettings(props: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("commit-code");
  return <CodingPromptSettingsView {...props} selected={selected} onSelect={setSelected} t={t} />;
}

export function CodingPromptSettingsView({ configuration, disabled, onChange, selected, onSelect, t }: Props & {
  selected: string; onSelect: (id: string) => void; t: TFunction;
}) {
  const actions = codingPromptActions(configuration, t("codingActions.commitCode"));
  const action = actions.find(item => item.id === selected) ?? actions[0];
  const update = (next: CodingPromptAction[]) => { if (!disabled) onChange({ ...configuration, promptActions: next }); };
  const patch = (value: Partial<CodingPromptAction>) => update(actions.map(item => item.id === action?.id ? { ...item, ...value } : item));
  const move = (direction: -1 | 1) => {
    const index = actions.findIndex(item => item.id === action?.id), target = index + direction;
    if (index < 0 || target < 0 || target >= actions.length) return;
    const next = [...actions];
    [next[index], next[target]] = [next[target], next[index]];
    update(next.map((item, order) => ({ ...item, order })));
  };
  const add = () => {
    if (disabled || actions.length >= 256) return;
    const id = `prompt:${crypto.randomUUID()}`;
    update([...actions, { id, label: t("codingActions.newPromptLabel"), prompt: "", enabled: true, order: Math.max(-1, ...actions.map((item, index) => item.order ?? index)) + 1 }]);
    onSelect(id);
  };
  return <div className="settings-form-grid">
    <Button disabled={disabled || actions.length >= 256} onClick={add}>{t("codingActions.addPrompt")}</Button>
    <Field label={t("codingActions.selectPrompt")}><SettingsMenuSelect label={t("codingActions.selectPrompt")} disabled={disabled || !actions.length} value={action?.id ?? ""} onChange={onSelect}
      options={actions.map(item => ({ id: item.id, label: item.label + (item.enabled === false ? t("codingActions.disabledSuffix") : "") }))} /></Field>
    {action && <>
      <Field label={t("codingActions.promptName")}><Input aria-label={t("codingActions.promptName")} value={action.label} disabled={disabled} maxLength={128} onChange={event => patch({ label: event.target.value })} /></Field>
      <Field label={t("codingActions.promptText")}>
        <Textarea aria-label={t("codingActions.promptText")} value={action.prompt ?? t("codingActions.commitPrompt")} disabled={disabled} maxLength={16000} onChange={event => patch({ prompt: event.target.value })} />
        {action.id === "commit-code" && <Button disabled={disabled || action.prompt === null} onClick={() => patch({ prompt: null })}>{t("codingActions.restoreDefaultPrompt")}</Button>}
      </Field>
      <Checkbox label={t("codingActions.enablePrompt")} aria-label={t("codingActions.enablePrompt")} checked={action.enabled !== false} disabled={disabled} onChange={event => patch({ enabled: event.target.checked })} />
      <div className="coding-shortcuts">
        <Button disabled={disabled || actions[0].id === action.id} onClick={() => move(-1)}>{t("codingActions.moveUp")}</Button>
        <Button disabled={disabled || actions.at(-1)?.id === action.id} onClick={() => move(1)}>{t("codingActions.moveDown")}</Button>
        <Button disabled={disabled} onClick={() => { if (!disabled && window.confirm(t("codingActions.deleteConfirm"))) update(actions.filter(item => item.id !== action.id)); }}>{t("codingActions.delete")}</Button>
      </div>
    </>}
  </div>;
}
