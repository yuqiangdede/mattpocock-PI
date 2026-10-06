import { useState } from "react";
import type { ShortcutConfiguration } from "@pi-desktop/shared";
import { Button, Field, Textarea } from "../../components/ui";
import { saveShortcutConfiguration } from "./shortcut-state";
import { confirmShortcutImport, exportShortcutConfiguration, parseShortcutImport } from "./shortcut-transfer";

type Props = { configuration: ShortcutConfiguration | null; draft: ShortcutConfiguration | null; busy: boolean; setBusy: (value: boolean) => void };
export function ShortcutImportExportControls({ configuration, draft, busy, setBusy }: Props) {
  const [text, setText] = useState("");
  const [candidate, setCandidate] = useState<ShortcutConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = Boolean(draft && configuration && JSON.stringify(draft) !== JSON.stringify(configuration));
  const inspect = () => {
    try { setCandidate(parseShortcutImport(text)); setError(null); setMessage(null); }
    catch (cause) { setCandidate(null); setError(String(cause)); }
  };
  const apply = async () => {
    if (!candidate || busy) return;
    const confirmed = window.confirm(`整体替换已保存的 ${configuration?.buttons.length ?? 0} 个按钮及当前编辑内容，导入 ${candidate.buttons.length} 个按钮？现有有效配置将先备份。`);
    if (!confirmed) return;
    setBusy(true); setError(null);
    try {
      await confirmShortcutImport(candidate, confirmed, saveShortcutConfiguration);
      setCandidate(null); setText(""); setMessage("快捷按钮已导入；缺失的 Skill 绑定将保留，可在按钮设置中查看状态。");
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  const download = () => {
    if (!configuration) return;
    const url = URL.createObjectURL(new Blob([exportShortcutConfiguration(configuration)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "skill-shortcuts.json";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="settings-form-grid">
    <Field label="JSON 导入导出" hint="导出上次成功保存的完整配置。可将配置文件的 JSON 内容粘贴到下方，在另一台机器使用。">
      <Button disabled={busy || !configuration} onClick={download}>导出 JSON 文件</Button>
    </Field>
    {dirty && <div role="status">当前有未保存修改；导出不包含这些修改，导入确认后会整体替换这些修改。</div>}
    <Field label="导入 JSON"><Textarea aria-label="导入 JSON" value={text} disabled={busy} onChange={event => { setText(event.target.value); setCandidate(null); setError(null); setMessage(null); }} /></Field>
    <Button disabled={busy || !text.trim()} onClick={inspect}>校验并预览导入</Button>
    {candidate && <div>
      <div role="status">整体替换：已保存 {configuration?.buttons.length ?? 0} 个按钮 → 导入 {candidate.buttons.length} 个按钮，其中常用 {candidate.buttons.filter(item => item.position === "primary").length} 个、更多 {candidate.buttons.filter(item => item.position === "more").length} 个、隐藏 {candidate.buttons.filter(item => !item.enabled).length} 个；保留 {candidate.deletedPresetIds.length} 项预置删除选择。名称、绑定、提示词、备注和顺序全部替换，固定操作保留。</div>
      <pre aria-label="导入配置预览" style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>{exportShortcutConfiguration(candidate)}</pre>
      <Button disabled={busy} onClick={() => void apply()}>确认整体替换</Button>
      <Button disabled={busy} onClick={() => { setCandidate(null); setMessage("已取消导入，当前配置和编辑内容保持不变。"); }}>取消导入</Button>
    </div>}
    {error && <div role="alert">导入失败，原配置、编辑内容及导入内容已保留：{error}</div>}
    {message && <div role="status">{message}</div>}
  </div>;
}
