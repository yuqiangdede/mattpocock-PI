import { useState } from "react";
import { useTranslation } from "react-i18next";
import { applyShortcutPresetUpdates, createDefaultShortcutConfiguration, getShortcutPresetUpdates, resolveShortcutText, type ShortcutConfiguration } from "@pi-desktop/shared";
import { Button, Checkbox } from "../../components/ui";

type Props = { draft: ShortcutConfiguration | null; busy: boolean; setDraft: (draft: ShortcutConfiguration) => void };
export function ShortcutPresetUpdates({ draft, busy, setDraft }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  if (!draft) return null;
  const defaults = createDefaultShortcutConfiguration();
  const updates = getShortcutPresetUpdates(draft, defaults);
  if (!updates.length) return null;
  const chosen = selected.filter(id => updates.some(item => item.presetId === id));
  return <div className="settings-stack" aria-label="预置内容更新">
    <div role="status">有 {updates.length} 项预置内容可核对。当前配置保持不变，请选择需要添加或恢复的项目。</div>
    <p>恢复已有按钮仅修改名称、Skill、提示词和备注；位置、顺序、分组与启用状态保留。新增按钮追加到列表末尾。点击保存后生效，保存前会备份当前配置。</p>
    {updates.map(update => {
      const preset = defaults.buttons.find(button => button.presetId === update.presetId)!;
      const text = resolveShortcutText(preset, t);
      const label = update.kind === "added" ? "新增预置" : update.kind === "deleted" ? "已删除预置有变化，明确添加后恢复" : update.kind === "untracked" ? "旧配置缺少预置基线，需要核对" : "预置内容有变化";
      return <details key={update.presetId}><summary>{text.name}：{label}</summary>
        <Checkbox aria-label={`采用预置 ${text.name}`} disabled={busy} checked={chosen.includes(update.presetId)} onChange={event => setSelected(value => event.target.checked ? [...value, update.presetId] : value.filter(id => id !== update.presetId))} label="采用此预置内容" />
        <div>Skill：{preset.binding.skillId}</div><pre style={{ whiteSpace: "pre-wrap" }}>{text.prompt}</pre><pre style={{ whiteSpace: "pre-wrap" }}>{text.note}</pre>
      </details>;
    })}
    <div className="coding-shortcuts"><Button disabled={busy || !chosen.length} onClick={() => {
      if (!window.confirm(`采用所选 ${chosen.length} 项预置？已有按钮的四项内容会恢复默认，已删除的所选按钮会重新添加。操作只修改草稿，点击保存后生效。`)) return;
      try { setDraft(applyShortcutPresetUpdates(draft, chosen)); setSelected([]); setError(""); } catch (cause) { setError(String(cause)); }
    }}>采用所选预置</Button><Button disabled={busy || !chosen.length} onClick={() => setSelected([])}>取消选择</Button></div>
    {error && <div role="alert">采用预置失败，原配置已保留：{error}</div>}
  </div>;
}
