import { useEffect, useState } from "react";
import { CodingActionRegistry, moveCodingAction, validateCodingActions, type CodingAction, type CodingActionConfiguration, type ComposerCommand } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Button, Checkbox, Field, Input, Textarea } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { SettingsCard } from "../settings/primitives";
import { loadCodingActions, resetCodingActions, saveCodingActions, setCodingActionLeaveGuard, useCodingActions } from "./coding-action-state";

export function CodingActionSettingsPage() {
  const { configuration, diagnostic, recoveryRequired, loaded } = useCodingActions();
  const [draft, setDraft] = useState<CodingActionConfiguration>(() => structuredClone(configuration));
  const [selected, setSelected] = useState(configuration.actions[0]?.id ?? "");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [catalog, setCatalog] = useState<ComposerCommand[]>([]), [catalogError, setCatalogError] = useState("");
  const [importText, setImportText] = useState("");
  const projectPath = useAppStore(state => state.workspace?.path ?? "");
  useEffect(() => { void loadCodingActions(); }, []);
  useEffect(() => {
    setDraft(structuredClone(configuration));
    setSelected(id => configuration.actions.some(action => action.id === id) ? id : configuration.actions[0]?.id ?? "");
  }, [configuration]);
  useEffect(() => {
    let active = true;
    void api.composerCommands().then(({ commands }) => { if (active) { setCatalog(commands.filter(item => item.kind === "skill")); setCatalogError(""); } })
      .catch(cause => { if (active) { setCatalog([]); setCatalogError(String(cause)); } });
    return () => { active = false; };
  }, [projectPath]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(configuration);
  useEffect(() => {
    setCodingActionLeaveGuard(() => !busy && (!dirty || window.confirm("有未保存的 Coding Actions 修改。放弃修改并离开？")));
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { setCodingActionLeaveGuard(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, busy]);
  const disabled = busy || !loaded;
  const action = draft.actions.find(item => item.id === selected);
  const patchAction = (patch: Partial<CodingAction>) => setDraft(value => ({ ...value, actions: value.actions.map(item => item.id === selected ? { ...item, ...patch } : item) }));
  const perform = async (operation: () => Promise<void>) => {
    if (disabled) return;
    setBusy(true); setMessage("");
    try { await operation(); }
    catch (cause) { setMessage(`操作失败，编辑内容和原配置已保留：${String(cause)}`); }
    finally { setBusy(false); }
  };
  const save = async (value = draft) => {
    if (recoveryRequired && !window.confirm("原配置不可用。确认先备份原文件，再保存当前 Coding Actions？")) return;
    await saveCodingActions(value, recoveryRequired === true);
    setMessage("Coding Actions 已保存");
  };
  const move = (direction: -1 | 1) => {
    try { setDraft(moveCodingAction(draft, selected, direction)); setMessage(""); }
    catch (cause) { setMessage(String(cause)); }
  };
  const add = () => {
    if (draft.actions.length >= 256) { setMessage("最多支持 256 个 Coding Actions"); return; }
    const id = `custom:${crypto.randomUUID()}`;
    setDraft(value => ({ ...value, actions: [...value.actions, { id, label: "新 Action", skillId: catalog[0]?.skillId ?? "implement", order: Math.max(-1, ...value.actions.map((item, index) => item.order ?? index)) + 1, enabled: true }] }));
    setSelected(id);
  };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(configuration, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "coding-actions.json";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importJson = async () => {
    if (importText.length > 8 * 1024 * 1024) throw new Error("导入文件过大");
    const parsed: unknown = JSON.parse(importText.replace(/^\uFEFF/, ""));
    const value = Array.isArray(parsed) ? { schemaVersion: 1, actions: parsed } : parsed;
    validateCodingActions(value);
    if (!window.confirm(`导入 ${value.actions.length} 个 Actions，将整体替换当前 ${configuration.actions.length} 个 Actions，并放弃未保存修改。确认先备份再替换？`)) return;
    await save(value); setImportText("");
  };
  const ordered = draft.actions.map((item, index) => ({ item, index })).sort((a, b) => (a.item.order ?? a.index) - (b.item.order ?? b.index));
  return <div className="settings-stack"><SettingsCard title="Coding Actions" description="独立编码动作只引用 Skill，彼此没有阶段、顺序约束或完成状态。点击动作通过当前会话的 Pi Agent 执行。">
    {diagnostic && <div role="alert">{diagnostic}<Button onClick={() => void loadCodingActions(true)}>重试读取</Button></div>}
    <div className="settings-form-grid">
      <Button disabled={disabled} onClick={add}>新建 Action</Button>
      <Field label="选择 Action"><SettingsMenuSelect label="选择 Action" disabled={disabled || !draft.actions.length} value={selected} onChange={setSelected} options={ordered.map(({ item }) => ({ id: item.id, label: item.label + (item.enabled === false ? "（已停用）" : "") }))} /></Field>
      {action && <>
        <Field label="Action 名称"><Input aria-label="Action 名称" value={action.label} disabled={disabled} maxLength={128} onChange={event => patchAction({ label: event.target.value })} /></Field>
        <Field label="Skill id" hint="沿用原生 Skill Catalog 的优先级；不复制或锁定 SKILL.md 内容。"><Input aria-label="Skill id" value={action.skillId} disabled={disabled} maxLength={128} onChange={event => patchAction({ skillId: event.target.value })} /></Field>
        {catalog.length > 0 && <Field label="选择现有 Skill"><SettingsMenuSelect label="选择现有 Skill" value={action.skillId} disabled={disabled} onChange={skillId => patchAction({ skillId })} options={[...(!catalog.some(item => item.skillId === action.skillId) ? [{ id: action.skillId, label: `${action.skillId}（不可用）` }] : []), ...catalog.filter(item => item.skillId).map(item => ({ id: item.skillId!, label: `${item.title} (${item.skillId})` }))]} /></Field>}
        {!catalog.some(item => item.skillId === action.skillId) && <div role="status">Skill missing / unavailable: {action.skillId}{catalogError && `；${catalogError}`}</div>}
        <Field label="说明"><Textarea aria-label="Action 说明" value={action.description ?? ""} disabled={disabled} maxLength={4000} onChange={event => patchAction({ description: event.target.value })} /></Field>
        <Field label="可选提示词" hint="留空时只调用 Skill；方法论由当前 SKILL.md 提供。"><Textarea aria-label="可选提示词" value={action.prompt ?? ""} disabled={disabled} maxLength={16000} onChange={event => patchAction({ prompt: event.target.value })} /></Field>
        <Checkbox label="启用此 Action" aria-label="启用 Action" disabled={disabled} checked={action.enabled !== false} onChange={event => patchAction({ enabled: event.target.checked })} />
        <div className="coding-shortcuts"><Button disabled={disabled} onClick={() => move(-1)}>上移</Button><Button disabled={disabled} onClick={() => move(1)}>下移</Button><Button disabled={disabled} onClick={() => { if (window.confirm("删除此 Action？保存后生效。")) { setDraft(value => ({ ...value, actions: value.actions.filter(item => item.id !== selected) })); setSelected(draft.actions.find(item => item.id !== selected)?.id ?? ""); } }}>删除 Action</Button></div>
      </>}
      <div className="coding-shortcuts"><Button disabled={disabled || !dirty} onClick={() => void perform(() => save())}>保存</Button><Button disabled={disabled || !dirty} onClick={() => { setDraft(structuredClone(configuration)); setSelected(configuration.actions[0]?.id ?? ""); setMessage(""); }}>取消</Button><Button disabled={disabled} onClick={() => { if (window.confirm("恢复默认 Coding Actions？会替换自定义动作，先备份当前配置。")) void perform(async () => { await resetCodingActions(); setMessage("已恢复默认 Actions"); }); }}>恢复默认 Actions</Button></div>
      <Button disabled={disabled} onClick={exportJson}>导出 Actions JSON</Button>
      <Field label="导入 Actions JSON"><Textarea aria-label="导入 Actions JSON" value={importText} disabled={disabled} onChange={event => setImportText(event.target.value)} /></Field>
      <Button disabled={disabled || !importText.trim()} onClick={() => void perform(importJson)}>校验并导入</Button>
      {message && <div role="status">{message}</div>}
    </div>
  </SettingsCard></div>;
}
