import { useEffect, useRef, useState } from "react";
import type { VersionSourceId, VersionSourceState } from "../../../../../packages/shared/src/version-sources";
import { api } from "../../lib/api";
import { Button } from "../../components/ui";
import { SettingsCard, SettingsRow } from "./primitives";

const titles: Record<VersionSourceId, string> = {
  "pi-desktop": "PI-Desktop 原版", "mattpocock-skills": "Matt Pocock 技能包", "mattpocock-pi": "mattpocock-PI",
};
const statuses = {
  idle: "尚未检测", current: "当前版本不低于最新发布", available: "有新版本",
  different: "版本不同，可前往查看", "no-release": "暂无可用发布", error: "检测失败",
};

export function VersionSourcesSection() {
  const [rows, setRows] = useState<VersionSourceState[]>([]);
  const [busy, setBusy] = useState<VersionSourceId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(new Set<VersionSourceId>());
  useEffect(() => {
    let cancelled = false;
    void api.versionSourcesList().then((result) => {
      if (!cancelled) setRows(result);
    }).catch((reason) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, []);
  const check = async (id: VersionSourceId) => {
    if (active.current.has(id)) return;
    active.current.add(id);
    setBusy([...active.current]);
    try {
      const result = await api.versionSourcesCheck(id);
      setRows((previous) => previous.map((row) => row.id === id ? result : row));
    } catch (reason) {
      setRows((previous) => previous.map((row) => row.id === id ? { ...row, status: "error", error: String(reason) } : row));
    } finally {
      active.current.delete(id);
      setBusy([...active.current]);
    }
  };
  const display = (row: VersionSourceState, version: string | null) => version ? row.id === "mattpocock-skills" ? version.slice(0, 12) : version : "—";
  return (
    <SettingsCard title="版本与更新来源" description="手动检测各来源；检测不会下载或安装更新。">
      <SettingsRow title="检查全部更新">
        <Button variant="secondary" disabled={!rows.length || busy.length > 0} onClick={() => void Promise.all(rows.map((row) => check(row.id)))}>
          {busy.length ? "正在检测…" : "检查全部更新"}
        </Button>
      </SettingsRow>
      {error && <div role="alert">版本信息读取失败：{error}</div>}
      {rows.map((row) => (
        <SettingsRow key={row.id} title={titles[row.id]} description={row.id === "pi-desktop" ? "当前版本为本应用的 PI-Desktop 基线；最新版本来自原版稳定发布。" : row.id === "mattpocock-skills" ? "当前版本为已安装技能包的提交 SHA；本地修改的技能可能保留。" : "最新版本来自 mattpocock-PI 发布；没有稳定版时显示预发布。"}>
          <div className="flex flex-col items-end gap-1.5">
            <div title={row.currentVersion ?? undefined}>{row.id === "pi-desktop" ? "本应用基线" : "当前"}：{row.currentVersion ? display(row, row.currentVersion) : "未安装或无法读取"}</div>
            <div title={row.latestVersion ?? undefined}>最新：{display(row, row.latestVersion)}</div>
            <div role="status" className="text-xs-plus text-text-muted">{busy.includes(row.id) ? "正在检测…" : row.status === "current" && row.id === "mattpocock-skills" ? "与上游一致" : statuses[row.status]}</div>
            {row.error && <div role="alert" className="text-xs-plus text-text-muted">{row.error}</div>}
            {row.checkedAt && <div className="text-xs-plus text-text-muted">上次检测：{new Date(row.checkedAt).toLocaleString()}</div>}
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy.includes(row.id)} onClick={() => void check(row.id)}>{row.status === "error" ? "重试" : "检测更新"}</Button>
              <Button variant="secondary" onClick={() => void api.versionSourcesOpen(row.id).catch((reason) => setError(String(reason)))}>查看更新</Button>
            </div>
          </div>
        </SettingsRow>
      ))}
    </SettingsCard>
  );
}
