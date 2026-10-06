import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type EngineeringSkillStatus, type EngineeringSkillUpdateMode } from "@pi-desktop/shared";
import { Button } from "../ui";
import { SettingsMenuSelect } from "./SettingsMenuSelect";

import { SettingsCard, SettingsRow } from "../../features/settings/primitives";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";

export function EngineeringSkillSettings({ onUpdated }: { onUpdated: () => Promise<void> }) {
  const { t } = useTranslation();
  const mode = useAppStore(state => state.settings?.engineeringSkillUpdateMode ?? "auto-check");
  const tasksRunning = useAppStore(state => Object.values(state.runningSessions).some(Boolean));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<EngineeringSkillStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const request = useRef(0);
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
        <Button disabled={Boolean(working || tasksRunning)} onClick={() => void update()}>{t("settings.updateEngineeringSkills")}</Button>
      </SettingsRow>
      <SettingsRow title={t("settings.engineering.lastCheck")} detail={status?.checkedAt ? new Date(status.checkedAt).toLocaleString() : t("settings.engineering.notChecked")}>
        <span role="status">{working ? t("settings.engineering.working") : status?.error ? t("settings.engineering.checkFailed") : available ? t("settings.engineering.available") : status?.latestRevision ? t("settings.engineering.current") : ""}</span>
      </SettingsRow>
      {Boolean(status?.preserved?.length) && <SettingsRow title={t("settings.engineering.preserved")} detail={status!.preserved!.join(", ")}><span>{t("settings.engineering.preservedHint")}</span></SettingsRow>}
    </SettingsCard>
    {tasksRunning && <div role="status">{t("versionUpdates.tasksRunning")}</div>}
    {error && <div role="alert">{t("coding.error")}: {error}</div>}
  </>;
}
