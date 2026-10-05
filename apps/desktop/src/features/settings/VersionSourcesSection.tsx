import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineeringSkillStatus } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Button } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { useUpdateState } from "../../hooks/use-update-state";
import { useAppStore } from "../../stores/app-store";
import { SettingsCard, SettingsRow } from "./primitives";

export function VersionSourcesSection() {
  const { t } = useTranslation();
  const update = useUpdateState();
  const tasksRunning = useAppStore(state => Object.values(state.runningSessions).some(Boolean));
  const [skills, setSkills] = useState<EngineeringSkillStatus | null>(null);
  const [busy, setBusy] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const active = useRef(new Set<string>());
  const alive = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    alive.current = true;
    const refresh = () => {
      const stamp = ++revision.current;
      void api.engineeringSkillStatus().then(value => {
        if (alive.current && revision.current === stamp) setSkills(value);
      }).catch(cause => {
        if (alive.current && revision.current === stamp) setError(String(cause));
      });
    };
    refresh();
    const off = api.onPluginChanged(refresh);
    return () => { alive.current = false; revision.current++; off(); };
  }, [tasksRunning]);
  const perform = async (id: string, operation: () => Promise<unknown>) => {
    if (active.current.has(id)) return;
    active.current.add(id);
    setBusy([...active.current]);
    setError(null);
    revision.current++;
    try { await operation(); }
    catch (cause) {
      const tasksError = String(cause).includes("TASKS_RUNNING")
        || (cause !== null && typeof cause === "object" && "code" in cause && cause.code === "TASKS_RUNNING");
      if (alive.current) setError(tasksError
        ? t("versionUpdates.tasksRunning") : cause instanceof Error ? cause.message : String(cause));
    } finally {
      active.current.delete(id);
      if (alive.current) setBusy([...active.current]);
    }
  };
  const checkSkills = () => perform("skills", async () => {
    const next = await api.checkEngineeringSkills();
    revision.current++;
    if (alive.current) setSkills(next);
  });
  const maintainSkills = (restore: boolean) => perform("skills", async () => {
    const changed = await (restore ? api.restoreEngineeringSkills() : api.updateEngineeringSkills());
    const next = await api.engineeringSkillStatus();
    revision.current++;
    if (alive.current) {
      setSkills(next);
      setResult(t(restore ? "versionUpdates.restored" : "versionUpdates.updated", {
        count: changed.updated.length, preserved: changed.preserved.length,
      }) + (changed.removed?.length ? " " + t("versionUpdates.removed", { names: changed.removed.join(", ") }) : ""));
    }
  });
  const checkApp = () => perform("app", () => api.updatesCheck());
  const appBusy = busy.includes("app") || update?.status === "checking" || update?.status === "downloading";
  const skillBusy = busy.includes("skills") || skills?.checking || skills?.updating;
  const blocked = tasksRunning;
  const skillAvailable = Boolean(skills?.latestRevision && skills.latestRevision !== skills.revision.slice(0, 40));
  const appAvailable = update?.status === "available";
  const canDownload = update?.mode === "in-app" || update?.automaticSupported || update?.manualDownloadSupported;
  return (
    <SettingsCard title={t("versionUpdates.title")} description={t("versionUpdates.hint")}>
      <SettingsRow title={t("versionUpdates.checkAll")}>
        <Button variant="secondary" disabled={Boolean(appBusy || skillBusy)} onClick={() => {
          void checkSkills(); void checkApp();
        }}>{t("versionUpdates.checkAll")}</Button>
      </SettingsRow>
      <SettingsRow title={t("versionUpdates.skills")} description={t("versionUpdates.skillsHint")}>
        <div className="flex flex-col items-end gap-1.5">
          <div>{t("versionUpdates.current")}: {skills?.revision.slice(0, 12) || "—"}</div>
          <div>{t("versionUpdates.latest")}: {skills?.latestRevision?.slice(0, 12) || "—"}</div>
          <div role="status">{t(skillBusy ? "versionUpdates.working" : skillAvailable ? "versionUpdates.available" : skills?.latestRevision ? "versionUpdates.currentStatus" : "versionUpdates.unchecked")}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={Boolean(skillBusy)} onClick={() => void checkSkills()}>{t("versionUpdates.check")}</Button>
            <Button variant="secondary" disabled={Boolean(skillBusy || blocked || !skillAvailable)} onClick={() => void maintainSkills(false)}>{t("versionUpdates.updateSkills")}</Button>
            <Button variant="secondary" disabled={Boolean(skillBusy || blocked || !skills?.hasBackup)} onClick={() => void maintainSkills(true)}>{t("versionUpdates.restore")}</Button>
            <Button variant="secondary" onClick={() => void perform("skills-link", () => api.versionSourcesOpen("mattpocock-skills"))}>{t("versionUpdates.view")}</Button>
          </div>
          {!!skills?.preserved?.length && <div>{t("versionUpdates.preserved")}: {skills.preserved.join(", ")}</div>}
          {skills?.error && <div role="alert">{skills.error}</div>}
          {result && <div role="status">{result}</div>}
        </div>
      </SettingsRow>
      <SettingsRow title={t("versionUpdates.app")} description={t("versionUpdates.appHint")}>
        <div className="flex flex-col items-end gap-1.5">
          <SettingsMenuSelect label={t("versionUpdates.channel")} value={update?.channel ?? "stable"}
            disabled={Boolean(appBusy || update?.status === "downloaded")}
            options={[{ id: "stable", label: t("versionUpdates.stable") }, { id: "prerelease", label: t("versionUpdates.prerelease") }]}
            onChange={channel => void perform("app", () => api.updatesSetChannel(channel === "prerelease" ? "prerelease" : "stable"))} />
          <div>{t("versionUpdates.current")}: {update?.currentVersion ?? "—"}</div>
          <div>{t("versionUpdates.latest")}: {update?.latestVersion ?? update?.availableVersion ?? "—"}</div>
          <div role="status">{t(`versionUpdates.appStatus.${update?.status ?? "idle"}`)}{update?.status === "downloading" ? ` ${update.progressPercent ?? 0}%` : ""}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={Boolean(appBusy || update?.status === "downloaded")} onClick={() => void checkApp()}>{t("versionUpdates.check")}</Button>
            <Button variant="secondary" disabled={Boolean(appBusy || !appAvailable || !canDownload)} onClick={() => void perform("app", () => api.updatesDownload())}>{t("versionUpdates.download")}</Button>
            {update?.mode === "in-app" && update.status === "downloaded" && <Button disabled={Boolean(appBusy || blocked)} onClick={() => void perform("app", () => api.updatesInstall())}>{t("versionUpdates.restart")}</Button>}
            <Button variant="secondary" onClick={() => void perform("app-link", () => api.updatesOpenReleases())}>{t("versionUpdates.view")}</Button>
          </div>
          {update?.mode === "manual" && update.manualDownloadSupported && <div>{t("versionUpdates.manualHint")}</div>}
          {update?.mode === "disabled" && <div>{t("versionUpdates.development")}</div>}
          {update?.error && <div role="alert">{update.error === "UPDATE_NO_RELEASE" ? t("versionUpdates.noRelease") : update.error}</div>}
        </div>
      </SettingsRow>
      {blocked && <div role="status">{t("versionUpdates.tasksRunning")}</div>}
      {error && <div role="alert">{error}</div>}
    </SettingsCard>
  );
}
