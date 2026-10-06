import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveShortcutText, shortcutPreview, SHORTCUT_GROUPS, type ShortcutConfiguration, type SkillShortcut } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { appendShortcut, copyShortcut, deleteShortcut, moveShortcut } from "./shortcut-editing";
import { Button, Field, Textarea } from "../../components/ui";
import { SettingsCard } from "../settings/primitives";
import { loadShortcutConfiguration, saveShortcutConfiguration, setShortcutLeaveGuard, useShortcutConfiguration } from "./shortcut-state";

import { ShortcutRecoveryControls } from "./ShortcutRecoveryControls";
import { ShortcutPresetUpdates } from "./ShortcutPresetUpdates";

export function ShortcutSettingsPage() {
  const { t } = useTranslation();
  const { configuration, error: loadError } = useShortcutConfiguration();
  const [draft, setDraft] = useState<ShortcutConfiguration | null>(() => configuration ? structuredClone(configuration) : null);
  const [selected, setSelected] = useState<string>(configuration?.buttons[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api.composerCommands().then(({ commands }) => {
      const ids = commands.filter(item => item.kind === "skill" && item.skillId).map(item => item.skillId!);
      if (active) setSkills([...new Set(ids)].filter(id => ids.filter(value => value === id).length === 1));
    }).catch(cause => { if (active) setSkillsError(String(cause)); });
    return () => { active = false; };
  }, []);
  useEffect(() => { void loadShortcutConfiguration(); }, []);
  useEffect(() => { if (configuration) { setDraft(structuredClone(configuration)); setSelected(value => configuration.buttons.some(item => item.id === value) ? value : configuration.buttons[0]?.id || ""); } }, [configuration]);
  const dirty = Boolean(draft && configuration && JSON.stringify(draft) !== JSON.stringify(configuration));
  useEffect(() => {
    setShortcutLeaveGuard(() => !busy && (!dirty || window.confirm("有未保存的快捷按钮修改。放弃修改并离开？")));
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { setShortcutLeaveGuard(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, busy]);
  const button = draft?.buttons.find(item => item.id === selected);
  const changeDraft = (change: (value: ShortcutConfiguration) => ShortcutConfiguration) => {
    if (!draft || busy) return;
    try { setDraft(change(draft)); setError(null); setSaved(false); }
    catch (cause) { setError(String(cause)); }
  };
  const add = (copy = false) => {
    const id = `custom:${crypto.randomUUID()}`;
    changeDraft(value => appendShortcut(value, copy && button ? copyShortcut(button, id, t) : {
      id, name: "新按钮", prompt: "", note: "", binding: { skillId: skills[0]! },
      position: "more", group: "exploration", enabled: true,
    }));
    if (draft && draft.buttons.length < 256) setSelected(id);
  };
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
        <div className="coding-shortcuts"><Button disabled={busy || !skills.length} onClick={() => add()}>新建按钮</Button><Button disabled={busy || !button} onClick={() => add(true)}>复制按钮</Button></div>
        {skillsError && <div role="alert">Skill 列表读取失败：{skillsError}</div>}
        {!skills.length && !skillsError && <div role="status">暂无可明确绑定的 Skill，已有按钮仍可编辑。</div>}
        <Field label="选择按钮"><select aria-label="选择按钮" value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>{draft.buttons.length === 0 && <option value="">暂无按钮，可新建按钮</option>}{draft.buttons.map(item => <option key={item.id} value={item.id}>{resolveShortcutText(item, t).name}{item.enabled ? "" : "（已隐藏）"}</option>)}</select></Field>
        {button && <>
          <Field label="按钮名称"><input aria-label="按钮名称" value={resolveShortcutText(button, t).name} maxLength={128} disabled={busy} onChange={event => patchButton({ name: event.target.value })} /></Field>
          <Field label="Skill"><select aria-label="Skill" value={button.binding.skillId} disabled={busy} onChange={event => patchButton({ binding: { skillId: event.target.value } })}>{!skills.includes(button.binding.skillId) && <option value={button.binding.skillId}>{button.binding.skillId}（当前不可用或存在歧义）</option>}{skills.map(id => <option key={id} value={id}>{id}</option>)}</select></Field>
          <Field label="显示位置"><select aria-label="显示位置" value={button.position} disabled={busy} onChange={event => patchButton({ position: event.target.value as SkillShortcut["position"] })}><option value="primary">常用</option><option value="more">更多</option></select></Field>
          {button.position === "more" && <Field label="更多分组"><select aria-label="更多分组" value={button.group} disabled={busy} onChange={event => patchButton({ group: event.target.value as SkillShortcut["group"] })}>{SHORTCUT_GROUPS.map(group => <option key={group} value={group}>{t(`coding.groups.${group}`)}</option>)}</select></Field>}
          <Field label="启用"><label><input aria-label="启用" type="checkbox" checked={button.enabled} disabled={busy} onChange={event => patchButton({ enabled: event.target.checked })} />显示此按钮（关闭后保留配置）</label></Field>
          <div className="coding-shortcuts"><Button disabled={busy || moveShortcut(draft, selected, -1) === draft} onClick={() => changeDraft(value => moveShortcut(value, selected, -1))}>上移</Button><Button disabled={busy || moveShortcut(draft, selected, 1) === draft} onClick={() => changeDraft(value => moveShortcut(value, selected, 1))}>下移</Button><Button disabled={busy} onClick={() => { if (window.confirm("删除此按钮？保存后生效。")) { changeDraft(value => deleteShortcut(value, selected)); setSelected(draft.buttons.find(item => item.id !== selected)?.id ?? ""); } }}>删除按钮</Button></div>
          <Field label="默认提示词" hint="留空时只插入 Skill 指令。"><Textarea aria-label="默认提示词" value={resolveShortcutText(button, t).prompt} maxLength={16000} disabled={busy} onChange={event => patchButton({ prompt: event.target.value })} /></Field>
          <Field label="备注" hint="仅用于按钮提示，不发送给模型。"><Textarea aria-label="备注" value={resolveShortcutText(button, t).note} maxLength={4000} disabled={busy} onChange={event => patchButton({ note: event.target.value })} /></Field>
          <Field label="插入内容预览"><pre aria-label="插入内容预览" style={{ whiteSpace: "pre-wrap" }}>{shortcutPreview(button, t)}</pre></Field>
        </>}
        <div className="coding-shortcuts"><Button disabled={!dirty || busy} onClick={() => void save()}>保存</Button><Button disabled={!dirty || busy} onClick={() => { setDraft(configuration ? structuredClone(configuration) : null); setSelected(value => configuration?.buttons.some(item => item.id === value) ? value : configuration?.buttons[0]?.id ?? ""); setError(null); setSaved(false); }}>取消</Button></div>
        {saved && <div role="status">快捷按钮已保存</div>}
        {error && <div role="alert">操作失败，编辑内容已保留：{error}</div>}
      </div>}
      <ShortcutRecoveryControls draft={draft} selected={selected} busy={busy} setBusy={setBusy} setDraft={setDraft} />
      <ShortcutPresetUpdates draft={draft} busy={busy} setDraft={setDraft} />
    </SettingsCard>
  </div>;
}
