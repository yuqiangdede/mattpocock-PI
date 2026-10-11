import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ENGINEERING_SHORTCUTS, CodingActionError, CodingActionRegistry, resolveCodingAction, codingPromptActions, type ComposerCommand } from "@pi-desktop/shared";
import { TaskGraphViewer } from "./TaskGraphViewer";
import { activateCodingShortcut } from "./coding-shortcut-activation";
import { codingShortcutTooltip } from "./coding-shortcut-tooltip";
import { groupCodingShortcuts, codingShortcutMenu, type CodingShortcut } from "./coding-shortcut-menu";
import { api } from "../../lib/api";
import { Button, TooltipButton } from "../../components/ui";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { useAppStore } from "../../stores/app-store";
import { loadCodingActions, useCodingActions } from "../extensions/coding-action-state";

export function CodingWorkbench({ disabled, error, onExecute, onSelectSkill, onSelectPrompt }: {
  disabled: boolean; error: string | null; onExecute: (actionId: string) => void; onSelectSkill: (skillId: string) => void; onSelectPrompt: (id: string) => void;
}) {
  const { t } = useTranslation();
  const projectPath = useAppStore(state => state.workspace?.path ?? "");
  const sessionId = useAppStore(state => state.activeSessionId);
  const { configuration, diagnostic } = useCodingActions();
  const [moreOpen, setMoreOpen] = useState(false);
  const [taskGraphOpen, setTaskGraphOpen] = useState(false);
  const workbenchRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [catalog, setCatalog] = useState<ComposerCommand[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void api.composerCommands().then(({ commands }) => { if (active) { setCatalog(commands); setCatalogError(null); } })
      .catch(cause => { if (active) { setCatalog([]); setCatalogError(String(cause)); } });
    return () => { active = false; };
  }, [projectPath, sessionId, configuration, catalogVersion]);
  useEffect(() => { void loadCodingActions(); }, []);
  useEffect(() => { if (disabled) setMoreOpen(false); }, [disabled]);
  const { primary, more } = codingShortcutMenu(configuration, catalog, { ask: t("codingActions.askNext"), diagnose: t("codingActions.diagnose"), skillLabels: Object.fromEntries(ENGINEERING_SHORTCUTS.map(entry => [entry.action, t(`coding.${entry.action}`)])) });
  const actions = [...primary, ...more];
  const reason = ({ action }: CodingShortcut) => {
    if (action.skillId === "implement-spec") return "";
    if (catalogError) return t("codingActions.executeFailed", { detail: catalogError });
    try { resolveCodingAction(action.id, new CodingActionRegistry({ schemaVersion: 1, actions: [action] }), catalog); return ""; }
    catch (cause) { return cause instanceof CodingActionError ? t(`codingActions.${cause.code === "SKILL_MISSING" ? "skillMissing" : cause.code}`, { skillId: action.skillId }) : t("codingActions.executeFailed", { detail: String(cause) }); }
  };
  const renderAction = (shortcut: CodingShortcut, menu = false) => {
    const { action } = shortcut;
    const unavailable = reason(shortcut);
    const note = unavailable || codingShortcutTooltip(shortcut, catalog, t);
    return <TooltipButton key={action.id} disabled={(disabled && action.skillId !== "implement-spec") || Boolean(unavailable)} className={menu ? "btn btn-ghost context-menu-item" : "btn btn-secondary"}
      role={menu ? "menuitem" : undefined} ariaLabel={action.label} tooltip={note} aria-description={note}
      tooltipClassName="ui-tooltip-help coding-skill-tooltip" onClick={event => { if (action.skillId === "implement-spec") returnFocusRef.current = menu ? workbenchRef.current?.querySelector<HTMLButtonElement>(`button[aria-haspopup="menu"]`) ?? null : event.currentTarget; setMoreOpen(false); activateCodingShortcut(shortcut, { openTaskGraph: () => setTaskGraphOpen(true), execute: onExecute, selectSkill: onSelectSkill }); }}>{action.label}</TooltipButton>;
  };
  const configure = () => { const store = useAppStore.getState(); store.setSettingsTab("codingActions"); store.setPage("settings"); };
  return <section ref={workbenchRef} className="coding-workbench" aria-label={t("codingActions.title")}>
    <div className="coding-shortcuts coding-shortcuts-primary">{primary.map(action => renderAction(action))}
      <AnchoredMenu open={moreOpen} onClose={() => setMoreOpen(false)} role="menu" side="top" restoreFocus={!disabled || more.some(shortcut => shortcut.action.skillId === "implement-spec")} label={t("codingActions.more")} menuClassName="context-menu coding-more-menu"
        trigger={ref => <Button ref={ref} variant="ghost" disabled={disabled && !more.some(shortcut => shortcut.action.skillId === "implement-spec")} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>{t("codingActions.more")}</Button>}>
        {groupCodingShortcuts(more).map(group => <div key={group.id} role="group" aria-label={t(`codingActions.groups.${group.id}`)}>
          <div className="coding-menu-group-label" aria-hidden="true">{t(`codingActions.groups.${group.id}`)}</div>
          {group.shortcuts.map(action => renderAction(action, true))}
        </div>)}
        {!more.length && <div role="status">{t("codingActions.noOtherSkills")}</div>}
      </AnchoredMenu>
    </div>
    <div className="coding-shortcuts coding-shortcuts-secondary">
      <Button variant="ghost" onClick={configure}>{t("codingActions.configure")}</Button>
      <div className="coding-prompt-actions">
        {codingPromptActions(configuration, t("codingActions.commitCode")).filter(action => action.enabled !== false).map(action =>
          <Button key={action.id} disabled={disabled} title={action.id === "commit-code" && action.prompt === null ? t("codingActions.commitHint") : t("codingActions.plainPromptHint")} onClick={() => onSelectPrompt(action.id)}>{action.label}</Button>)}
      </div>
    </div>
    {actions.some(action => reason(action)) && <div role="status">{actions.filter(action => reason(action)).map(shortcut => `${shortcut.action.label}：${reason(shortcut)}`).join("；")}<Button onClick={() => setCatalogVersion(value => value + 1)}>{t("codingActions.recheck")}</Button></div>}
    {(error || diagnostic) && <div className="coding-shortcut-error" role="alert"><span>{error || t("codingActions.diagnostic", { detail: diagnostic })}</span><Button onClick={configure}>{t("codingActions.configure")}</Button></div>}
    {taskGraphOpen && <TaskGraphViewer onClose={() => setTaskGraphOpen(false)} returnFocus={returnFocusRef.current} />}
  </section>;
}
