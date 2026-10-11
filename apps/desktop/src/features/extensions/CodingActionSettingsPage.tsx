import { useEffect, useRef, useState } from "react";
import { CodingActionRegistry, moveCodingAction, validateCodingActions, type CodingAction, type CodingActionConfiguration, type ComposerCommand } from "@pi-desktop/shared";
import { useTranslation } from "react-i18next";
import { CodingActionOperationController } from "./coding-action-operation-controller";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Button, Checkbox, Field, Input, Textarea } from "../../components/ui";
import { SettingsMenuSelect } from "../../components/settings/SettingsMenuSelect";
import { SettingsCard } from "../settings/primitives";
import { CodingActionContentFields } from "./CodingActionContentFields";
import { CodingPromptSettings } from "./CodingPromptSettings";
import { loadCodingActions, resetCodingActions, saveCodingActions, setCodingActionLeaveGuard, useCodingActions } from "./coding-action-state";

export function CodingActionSettingsPage() {
  const { t } = useTranslation();
  const operations = useRef(new CodingActionOperationController()).current;
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
    setCodingActionLeaveGuard(() => !operations.busy && (!dirty || window.confirm(t("codingActions.leaveConfirm"))));
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || operations.busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { setCodingActionLeaveGuard(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, busy, operations, t]);
  const disabled = busy || !loaded;
  const action = draft.actions.find(item => item.id === selected);
  const patchAction = (patch: Partial<CodingAction>) => { if (operations.busy) return; setDraft(value => ({ ...value, actions: value.actions.map(item => item.id === selected ? { ...item, ...patch } : item) })); };
  const perform = async (operation: () => Promise<void>) => {
    if (!loaded) return;
    await operations.run(operation, setBusy, () => setMessage(""), cause => setMessage(t("codingActions.operationFailed", { detail: String(cause) })));
  };
  const save = async (value = draft) => {
    if (recoveryRequired && !window.confirm(t("codingActions.recoverConfirm"))) return;
    await saveCodingActions(value, recoveryRequired === true);
    setMessage(t("codingActions.saved"));
  };
  const move = (direction: -1 | 1) => {
    if (operations.busy) return;
    try { setDraft(moveCodingAction(draft, selected, direction)); setMessage(""); }
    catch (cause) { setMessage(t("codingActions.operationFailed", { detail: String(cause) })); }
  };
  const add = () => {
    if (operations.busy) return;
    if (draft.actions.length >= 256) { setMessage(t("codingActions.limit")); return; }
    const id = `custom:${crypto.randomUUID()}`;
    setDraft(value => ({ ...value, actions: [...value.actions, { id, label: t("codingActions.newLabel"), skillId: catalog[0]?.skillId ?? "implement", order: Math.max(-1, ...value.actions.map((item, index) => item.order ?? index)) + 1, enabled: true }] }));
    setSelected(id);
  };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(configuration, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "coding-actions.json";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importJson = async () => {
    if (importText.length > 8 * 1024 * 1024) throw new Error(t("codingActions.importTooLarge"));
    const parsed: unknown = JSON.parse(importText.replace(/^\uFEFF/, ""));
    const value = Array.isArray(parsed) ? { schemaVersion: 1, actions: parsed } : parsed;
    validateCodingActions(value);
    if (!window.confirm(t("codingActions.importConfirm", { count: value.actions.length + (value.promptActions?.length ?? 1), current: configuration.actions.length + (configuration.promptActions?.length ?? 1) }))) return;
    await save(value); setImportText("");
  };
  const ordered = CodingActionRegistry.sort(draft.actions);
  return <div className="settings-stack"><SettingsCard title={t("codingActions.title")} description={t("codingActions.description")}>
    {diagnostic && <div role="alert">{t("codingActions.diagnostic", { detail: diagnostic })}<Button disabled={disabled} onClick={() => void operations.retry(dirty, () => window.confirm(t("codingActions.retryConfirm")), () => loadCodingActions(true), setBusy, () => setMessage(""), cause => setMessage(t("codingActions.operationFailed", { detail: String(cause) })))}>{t("codingActions.retry")}</Button></div>}
    <div className="settings-form-grid">
      <Button disabled={disabled} onClick={add}>{t("codingActions.add")}</Button>
      <Field label={t("codingActions.select")}><SettingsMenuSelect label={t("codingActions.select")} disabled={disabled || !draft.actions.length} value={selected} onChange={setSelected} options={ordered.map(item => ({ id: item.id, label: item.label + (item.enabled === false ? t("codingActions.disabledSuffix") : "") }))} /></Field>
      {action && <>
        <Field label={t("codingActions.name")}><Input aria-label={t("codingActions.name")} value={action.label} disabled={disabled} maxLength={128} onChange={event => patchAction({ label: event.target.value })} /></Field>
        <Field label={t("codingActions.skillId")} hint={t("codingActions.skillHint")}><Input aria-label={t("codingActions.skillId")} value={action.skillId} disabled={disabled} maxLength={128} onChange={event => patchAction({ skillId: event.target.value })} /></Field>
        {catalog.length > 0 && <Field label={t("codingActions.selectSkill")}><SettingsMenuSelect label={t("codingActions.selectSkill")} value={action.skillId} disabled={disabled} onChange={skillId => patchAction({ skillId })} options={[...(!catalog.some(item => item.skillId === action.skillId) ? [{ id: action.skillId, label: t("codingActions.unavailableSkill", { skillId: action.skillId }) }] : []), ...catalog.filter(item => item.skillId).map(item => ({ id: item.skillId!, label: `${item.title} (${item.skillId})` }))]} /></Field>}
        {!catalog.some(item => item.skillId === action.skillId) && <div role="status">{t("codingActions.skillMissing", { skillId: action.skillId })}{catalogError && `；${catalogError}`}</div>}
        <CodingActionContentFields action={action} catalog={catalog} disabled={disabled} onChange={patchAction} />
        <Checkbox label={t("codingActions.enabled")} aria-label={t("codingActions.enabledAria")} disabled={disabled} checked={action.enabled !== false} onChange={event => patchAction({ enabled: event.target.checked })} />
        <div className="coding-shortcuts"><Button disabled={disabled} onClick={() => move(-1)}>{t("codingActions.moveUp")}</Button><Button disabled={disabled} onClick={() => move(1)}>{t("codingActions.moveDown")}</Button><Button disabled={disabled} onClick={() => { if (!operations.busy && window.confirm(t("codingActions.deleteConfirm"))) { setDraft(value => ({ ...value, actions: value.actions.filter(item => item.id !== selected) })); setSelected(draft.actions.find(item => item.id !== selected)?.id ?? ""); } }}>{t("codingActions.delete")}</Button></div>
      </>}
    </div>
  </SettingsCard>
  <SettingsCard title={t("codingActions.promptButtons")}>
    <CodingPromptSettings configuration={draft} disabled={disabled} onChange={value => { if (!operations.busy) setDraft(value); }} />
  </SettingsCard>
  <div className="settings-form-grid">
      <div className="coding-shortcuts"><Button disabled={disabled || !dirty} onClick={() => void perform(() => save())}>{t("codingActions.save")}</Button><Button disabled={disabled || !dirty} onClick={() => { if (operations.busy) return; setDraft(structuredClone(configuration)); setSelected(configuration.actions[0]?.id ?? ""); setMessage(""); }}>{t("codingActions.cancel")}</Button><Button disabled={disabled} onClick={() => void perform(async () => { if (window.confirm(t("codingActions.resetConfirm"))) { await resetCodingActions(); setMessage(t("codingActions.resetDone")); } })}>{t("codingActions.reset")}</Button></div>
      <Button disabled={disabled} onClick={exportJson}>{t("codingActions.export")}</Button>
      <Field label={t("codingActions.import")}><Textarea aria-label={t("codingActions.import")} value={importText} disabled={disabled} onChange={event => setImportText(event.target.value)} /></Field>
      <Button disabled={disabled || !importText.trim()} onClick={() => void perform(importJson)}>{t("codingActions.validateImport")}</Button>
      {message && <div role="status">{message}</div>}
    </div>
  </div>;
}
