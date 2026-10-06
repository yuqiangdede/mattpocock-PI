import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { useState } from "react";
import { restoreShortcutPreset, type ShortcutConfiguration } from "@pi-desktop/shared";
import { Button, Field } from "../../components/ui";
import { api } from "../../lib/api";
import { restoreShortcutConfiguration } from "./shortcut-state";

type Props = {
  draft: ShortcutConfiguration | null; selected: string; busy: boolean;
  setBusy: (busy: boolean) => void; setDraft: (draft: ShortcutConfiguration | null) => void;
};
export function ShortcutRecoveryControls({ draft, selected, busy, setBusy, setDraft }: Props) {
  const [backups, setBackups] = useState<string[]>([]);
  const [backup, setBackup] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const button = draft?.buttons.find(item => item.id === selected);
  const restore = async (backupId?: string) => {
    const detail = draft ? `当前 ${draft.buttons.length} 个按钮、${draft.buttons.filter(item => !item.presetId).length} 个自建按钮及删除选择将被替换。` : "当前配置将被替换。";
    if (!window.confirm(`${backupId ? "从所选备份恢复" : "恢复整套默认按钮和布局"}？${detail}未保存修改会丢弃。恢复前会备份当前文件。`)) return;
    setBusy(true); setError(""); setMessage("");
    try { const restored = await restoreShortcutConfiguration(backupId); setDraft(structuredClone(restored)); setMessage("快捷按钮恢复成功"); }
    catch (cause) { setError(`恢复失败，当前配置已保留：${String(cause)}`); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); setError("");
    try { const valid = await api.listShortcutBackups(); setBackups(valid); setBackup(valid[0] ?? ""); setMessage(valid.length ? "已列出有效备份" : "没有可恢复的有效备份"); }
    catch (cause) { setError(`读取备份失败：${String(cause)}`); }
    finally { setBusy(false); }
  };
  return <div className="settings-stack">
    <div className="coding-shortcuts">
      <Button disabled={busy || !button?.presetId} onClick={() => { if (!draft || !button) return; setDraft({ ...draft, buttons: draft.buttons.map(item => item.id === selected ? restoreShortcutPreset(item) : item) }); setMessage("已恢复单项默认内容，点击保存后生效；位置和启用状态保持不变。"); setError(""); }}>恢复当前按钮内容</Button>
      <Button disabled={busy} onClick={() => void restore()}>恢复整套默认</Button>
      <Button disabled={busy} onClick={() => void refresh()}>查看有效备份</Button>
    </div>
    {backups.length > 0 && <Field label="选择恢复备份"><SettingsMenuSelect label="选择恢复备份" disabled={busy} value={backup} onChange={setBackup} options={backups.map(id => ({ id, label: id }))} /><Button disabled={busy || !backup} onClick={() => void restore(backup)}>恢复所选备份</Button></Field>}
    {message && <div role="status">{message}</div>}
    {error && <div role="alert">{error}</div>}
  </div>;
}
