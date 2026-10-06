import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveShortcutText, shortcutPreview, type ShortcutConfiguration, type SkillShortcut } from "@pi-desktop/shared";
import { Button, Field, Textarea } from "../../components/ui";
import { SettingsCard } from "../settings/primitives";
import { loadShortcutConfiguration, saveShortcutConfiguration, setShortcutLeaveGuard, useShortcutConfiguration } from "./shortcut-state";

export function ShortcutSettingsPage() {
  const { t } = useTranslation();
  const { configuration, error: loadError } = useShortcutConfiguration();
  const [draft, setDraft] = useState<ShortcutConfiguration | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void loadShortcutConfiguration(); }, []);
  useEffect(() => { if (configuration) { setDraft(structuredClone(configuration)); setSelected(value => value || configuration.buttons[0]?.id || ""); } }, [configuration]);
  const dirty = Boolean(draft && configuration && JSON.stringify(draft) !== JSON.stringify(configuration));
  useEffect(() => {
    setShortcutLeaveGuard(() => !busy && (!dirty || window.confirm("有未保存的快捷按钮修改。放弃修改并离开？")));
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { setShortcutLeaveGuard(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, busy]);
  const button = draft?.buttons.find(item => item.id === selected);
  const patchButton = (patch: Partial<SkillShortcut>) => {
    setSaved(false);
    setDraft(value => value ? { ...value, buttons: value.buttons.map(item => item.id === selected ? { ...item, ...patch } : item) } : value);
  };
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true); setError(null); setSaved(false);
    try { await saveShortcutConfiguration(draft); setSaved(true); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  return <div className="settings-stack">
    <SettingsCard title="快捷按钮" description="Matt 预置与自定义按钮使用同一份独立扩展配置。点击按钮只插入草稿，备注不会发送。">
      {loadError && <div role="alert">快捷按钮配置读取失败，原文件已保留：{loadError}<Button onClick={() => void loadShortcutConfiguration()}>重试读取</Button></div>}
      {draft && <div className="settings-form-grid">
        <Field label="选择按钮"><select aria-label="选择按钮" value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>{draft.buttons.map(item => <option key={item.id} value={item.id}>{resolveShortcutText(item, t).name}</option>)}</select></Field>
        {button && <>
          <Field label="按钮名称"><input aria-label="按钮名称" value={resolveShortcutText(button, t).name} maxLength={128} disabled={busy} onChange={event => patchButton({ name: event.target.value })} /></Field>
          <Field label="Skill"><code>{button.binding.skillId}</code></Field>
          <Field label="默认提示词" hint="留空时只插入 Skill 指令。"><Textarea aria-label="默认提示词" value={resolveShortcutText(button, t).prompt} maxLength={16000} disabled={busy} onChange={event => patchButton({ prompt: event.target.value })} /></Field>
          <Field label="备注" hint="仅用于按钮提示，不发送给模型。"><Textarea aria-label="备注" value={resolveShortcutText(button, t).note} maxLength={4000} disabled={busy} onChange={event => patchButton({ note: event.target.value })} /></Field>
          <Field label="插入内容预览"><pre aria-label="插入内容预览" style={{ whiteSpace: "pre-wrap" }}>{shortcutPreview(button, t)}</pre></Field>
        </>}
        <div className="coding-shortcuts"><Button disabled={!dirty || busy} onClick={() => void save()}>保存</Button><Button disabled={!dirty || busy} onClick={() => { setDraft(configuration ? structuredClone(configuration) : null); setError(null); setSaved(false); }}>取消</Button></div>
        {saved && <div role="status">快捷按钮已保存</div>}
        {error && <div role="alert">保存失败，编辑内容已保留：{error}</div>}
      </div>}
    </SettingsCard>
  </div>;
}
