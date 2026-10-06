import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveShortcutBinding, qualifiedSkillId, resolveShortcutText, shortcutPreview, SHORTCUT_GROUPS, type ComposerCommand, type ShortcutConfiguration, type SkillShortcut } from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";
import { appendShortcut, copyShortcut, deleteShortcut, moveShortcut } from "./shortcut-editing";
import { Button, Checkbox, Field, Input, Textarea } from "../../components/ui";
import { SettingsCard } from "../settings/primitives";
import { loadShortcutConfiguration, saveShortcutConfiguration, setShortcutLeaveGuard, useShortcutConfiguration } from "./shortcut-state";

import { ShortcutRecoveryControls } from "./ShortcutRecoveryControls";
import { ShortcutPresetUpdates } from "./ShortcutPresetUpdates";
import { ShortcutImportExportControls } from "./ShortcutImportExportControls";

export function ShortcutSettingsPage() {
  const { t } = useTranslation();
  const { configuration, error: loadError } = useShortcutConfiguration();
  const [draft, setDraft] = useState<ShortcutConfiguration | null>(() => configuration ? structuredClone(configuration) : null);
  const [selected, setSelected] = useState<string>(configuration?.buttons[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const projectPath = useAppStore(state => state.workspace?.path ?? "");
  const [skills, setSkills] = useState<ComposerCommand[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void api.composerCommands().then(({ commands }) => {
      if (active) { setSkills(commands.filter(item => item.shortcutBinding)); setSkillsError(null); }
    }).catch(cause => { if (active) { setSkills([]); setSkillsError(String(cause)); } });
    return () => { active = false; };
  }, [projectPath]);
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
      id, name: "新按钮", prompt: "", note: "", binding: { ...skills[0]!.shortcutBinding! },
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
        <Field label="选择按钮"><SettingsMenuSelect label="选择按钮" value={selected} disabled={busy || !draft.buttons.length} onChange={setSelected} options={draft.buttons.length ? draft.buttons.map(item => ({ id: item.id, label: resolveShortcutText(item, t).name + (item.enabled ? "" : "（已隐藏）") })) : [{ id: "", label: "暂无按钮，可新建按钮" }]} /></Field>
        {button && <>
          <Field label="按钮名称"><Input aria-label="按钮名称" value={resolveShortcutText(button, t).name} maxLength={128} disabled={busy} onChange={event => patchButton({ name: event.target.value })} /></Field>
          <Field label="Skill" hint="来源绑定可跨机器使用；当前项目来源指每次打开的项目。"><SettingsMenuSelect label="Skill" value={button.binding.source ? qualifiedSkillId(button.binding) : button.binding.skillId} disabled={busy} fullWidth onChange={id => { const choice = skills.find(item => item.name === id); if (choice?.shortcutBinding) patchButton({ binding: { ...choice.shortcutBinding } }); }} options={[
            { id: button.binding.source ? qualifiedSkillId(button.binding) : button.binding.skillId, label: `${button.binding.skillId} · ${button.binding.source ?? "自动唯一匹配"}${button.binding.sourceId ? ` · ${button.binding.sourceId}` : ""}` },
            ...skills.filter(item => item.name !== (button.binding.source ? qualifiedSkillId(button.binding) : button.binding.skillId)).map(item => ({ id: item.name, label: `${item.title} (${item.shortcutBinding!.skillId})` })),
          ]} />{(() => { try { resolveShortcutBinding(button.binding, skills); return null; } catch (cause) { return <div role="status">{String(cause)}</div>; } })()}</Field>

          <Field label="显示位置"><SettingsMenuSelect label="显示位置" value={button.position} disabled={busy} onChange={value => patchButton({ position: value as SkillShortcut["position"] })} options={[{ id: "primary", label: "常用" }, { id: "more", label: "更多" }]} /></Field>
          {button.position === "more" && <Field label="更多分组"><SettingsMenuSelect label="更多分组" value={button.group} disabled={busy} onChange={value => patchButton({ group: value as SkillShortcut["group"] })} options={SHORTCUT_GROUPS.map(group => ({ id: group, label: t(`coding.groups.${group}`) }))} /></Field>}
          <Field label="启用"><Checkbox aria-label="启用" checked={button.enabled} disabled={busy} onChange={event => patchButton({ enabled: event.target.checked })} label="显示此按钮（关闭后保留配置）" /></Field>
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
      <ShortcutImportExportControls configuration={configuration} draft={draft} busy={busy} setBusy={setBusy} />
    </SettingsCard>
  </div>;
}
