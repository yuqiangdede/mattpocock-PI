import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ENGINEERING_SHORTCUTS, ENGINEERING_PROMPT_MAX_LENGTH, resolveShortcutInstruction, type EngineeringShortcutAction, type EngineeringSkillStatus, type EngineeringSkillUpdateMode } from "@pi-desktop/shared";
import { Button, Field, Textarea } from "../ui";
import { SettingsMenuSelect } from "./SettingsMenuSelect";
import { EngineeringSkillDescription } from "./EngineeringSkillDescription";
import { SettingsCard, SettingsRow } from "../../features/settings/primitives";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";

export function EngineeringSkillSettings({ onUpdated }: { onUpdated: () => Promise<void> }) {
  const { t } = useTranslation();
  const prompts = useAppStore(state => state.settings?.engineeringShortcutPrompts);
  const mode = useAppStore(state => state.settings?.engineeringSkillUpdateMode ?? "auto-check");
  const [action, setAction] = useState<EngineeringShortcutAction>("ask");
  const defaults = t(`coding.prompts.${action}`);
  const saved = resolveShortcutInstruction(action, defaults, prompts);
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<EngineeringSkillStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const request = useRef(0);
  useEffect(() => { setText(saved); }, [saved, action]);
  useEffect(() => {
    alive.current = true;
    const refresh = () => {
      const stamp = ++request.current;
      void api.engineeringSkillStatus().then(value => {
        if (alive.current && stamp === request.current) setStatus(value);
      }).catch(cause => { if (alive.current && stamp === request.current) setError(String(cause)); });
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { alive.current = false; request.current++; clearInterval(timer); };
  }, []);
  const perform = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null); request.current++;
    try { await operation(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (alive.current) setBusy(false); }
  };
  const savePrompt = (restore: boolean) => perform(async () => {
    const current = await api.getSettings();
    const next = { ...current.engineeringShortcutPrompts, [action]: restore ? null : text };
    await api.setEngineeringSettings({ engineeringShortcutPrompts: next });
    useAppStore.setState(state => ({ settings: state.settings ? { ...state.settings, engineeringShortcutPrompts: next } : state.settings }));
  });
  const saveMode = (next: EngineeringSkillUpdateMode) => perform(async () => {
    await api.setEngineeringSettings({ engineeringSkillUpdateMode: next });
    useAppStore.setState(state => ({ settings: state.settings ? { ...state.settings, engineeringSkillUpdateMode: next } : state.settings }));
    if (next === "auto-check") {
      const result = await api.checkEngineeringSkills(true);
      if (alive.current) setStatus(result);
    }
  });
  const check = () => perform(async () => { const result = await api.checkEngineeringSkills(); if (alive.current) setStatus(result); });
  const update = () => perform(async () => {
    const result = await api.updateEngineeringSkills();
    await onUpdated();
    const next = await api.engineeringSkillStatus();
    if (alive.current) {
      setStatus(next);
      useAppStore.getState().showToast(t("settings.engineeringSkillsUpdated", { count: result.updated.length, preserved: result.preserved.length }));
    }
  });
  const working = busy || status?.checking || status?.updating;
  const available = Boolean(status?.latestRevision && status.latestRevision !== status.revision.slice(0, 40));
  return <>
    <SettingsCard title={t("settings.engineering.instructions")} description={t("settings.engineering.instructionsHint")}>
      <SettingsRow title={t("settings.engineering.shortcut")}>
        <SettingsMenuSelect label={t("settings.engineering.shortcut")} value={action} disabled={busy}
          options={ENGINEERING_SHORTCUTS.map(item => ({ id: item.action, label: t(`coding.${item.action}`) }))}
          onChange={value => setAction(value as EngineeringShortcutAction)} />
      </SettingsRow>
      <div className="settings-form-grid">
        <EngineeringSkillDescription action={action} />
        <Field label={t("settings.engineering.prompt")} hint={t("settings.engineering.emptyHint")}>
          <Textarea aria-label={t("settings.engineering.prompt")} className="settings-instruction-editor" value={text} maxLength={ENGINEERING_PROMPT_MAX_LENGTH} disabled={busy} onChange={event => setText(event.target.value)} />
        </Field>
        <div className="coding-shortcuts">
          <Button disabled={busy || text === saved} onClick={() => void savePrompt(false)}>{t("settings.engineering.save")}</Button>
          <Button disabled={busy || prompts?.[action] == null} onClick={() => void savePrompt(true)}>{t("settings.engineering.restore")}</Button>
        </div>
      </div>
    </SettingsCard>
    <SettingsCard title={t("settings.engineering.updates")} description={t("settings.engineering.updatesHint")}>
      <SettingsRow title={t("settings.engineering.mode")}>
        <SettingsMenuSelect label={t("settings.engineering.mode")} value={mode} disabled={Boolean(working)}
          options={[{ id: "auto-check", label: t("settings.engineering.auto") }, { id: "manual", label: t("settings.engineering.manual") }]}
          onChange={value => void saveMode(value as EngineeringSkillUpdateMode)} />
      </SettingsRow>
      <SettingsRow title={t("settings.engineering.installed")} detail={status?.revision ?? t("settings.engineering.loading")}>
        <Button disabled={Boolean(working)} onClick={() => void check()}>{t("settings.engineering.check")}</Button>
      </SettingsRow>
      <SettingsRow title={t("settings.engineering.latest")} detail={status?.latestRevision ?? t("settings.engineering.notChecked")}>
        <Button disabled={Boolean(working)} onClick={() => void update()}>{t("settings.updateEngineeringSkills")}</Button>
      </SettingsRow>
      <SettingsRow title={t("settings.engineering.lastCheck")} detail={status?.checkedAt ? new Date(status.checkedAt).toLocaleString() : t("settings.engineering.notChecked")}>
        <span role="status">{working ? t("settings.engineering.working") : status?.error ? t("settings.engineering.checkFailed") : available ? t("settings.engineering.available") : status?.latestRevision ? t("settings.engineering.current") : ""}</span>
      </SettingsRow>
      {Boolean(status?.preserved?.length) && <SettingsRow title={t("settings.engineering.preserved")} detail={status!.preserved!.join(", ")}><span>{t("settings.engineering.preservedHint")}</span></SettingsRow>}
    </SettingsCard>
    {error && <div role="alert">{t("coding.error")}: {error}</div>}
  </>;
}
