import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodingActionRegistry, resolveCodingAction, type CodingAction, type ComposerCommand } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Button, TooltipButton } from "../../components/ui";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import { useAppStore } from "../../stores/app-store";
import { RequirementsConfirmation } from "../requirements/RequirementsConfirmation";
import { loadCodingActions, useCodingActions } from "../extensions/coding-action-state";

export function CodingWorkbench({ disabled, error, onExecute }: {
  disabled: boolean; error: string | null; onExecute: (actionId: string) => void;
}) {
  const { t } = useTranslation();
  const projectPath = useAppStore(state => state.workspace?.path ?? "");
  const sessionId = useAppStore(state => state.activeSessionId);
  const { configuration, diagnostic } = useCodingActions();
  const [moreOpen, setMoreOpen] = useState(false);
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
  const registry = new CodingActionRegistry(configuration);
  const actions = registry.list(true);
  const reason = (action: CodingAction) => {
    if (catalogError) return catalogError;
    try { resolveCodingAction(action.id, registry, catalog); return ""; }
    catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
  };
  const renderAction = (action: CodingAction, menu = false) => {
    const unavailable = reason(action);
    const note = unavailable || action.description || catalog.find(command => command.skillId === action.skillId)?.description || action.label;
    return <TooltipButton key={action.id} disabled={disabled || Boolean(unavailable)} className={menu ? "btn btn-ghost context-menu-item" : "btn btn-secondary"}
      role={menu ? "menuitem" : undefined} ariaLabel={action.label} tooltip={note} aria-description={note}
      tooltipClassName="ui-tooltip-help coding-skill-tooltip" onClick={() => { setMoreOpen(false); onExecute(action.id); }}>{action.label}</TooltipButton>;
  };
  const configure = () => { const store = useAppStore.getState(); store.setSettingsTab("codingActions"); store.setPage("settings"); };
  return <section className="coding-workbench" aria-label="Coding Actions">
    <div className="coding-shortcuts coding-shortcuts-primary">{actions.slice(0, 6).map(action => renderAction(action))}</div>
    <div className="coding-shortcuts coding-shortcuts-secondary">
      <Button variant="ghost" onClick={() => useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("workflow"))}>{t("coding.formal")}</Button>
      <RequirementsConfirmation projectPath={projectPath} disabled={disabled} />
      {actions.length > 6 && <AnchoredMenu open={moreOpen} onClose={() => setMoreOpen(false)} role="menu" side="top" restoreFocus={!disabled} label="More Actions" menuClassName="context-menu coding-more-menu"
        trigger={ref => <Button ref={ref} variant="ghost" disabled={disabled} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>更多 Actions</Button>}>
        {actions.slice(6).map(action => renderAction(action, true))}
      </AnchoredMenu>}
      <Button variant="ghost" onClick={configure}>配置编码 Actions</Button>
    </div>
    {actions.some(action => reason(action)) && <div role="status">{actions.filter(action => reason(action)).map(action => `${action.label}：${reason(action)}`).join("；")}<Button onClick={() => setCatalogVersion(value => value + 1)}>重新检测 Skill</Button></div>}
    {(error || diagnostic) && <div className="coding-shortcut-error" role="alert"><span>{error || diagnostic}</span><Button onClick={configure}>配置编码 Actions</Button></div>}
  </section>;
}
