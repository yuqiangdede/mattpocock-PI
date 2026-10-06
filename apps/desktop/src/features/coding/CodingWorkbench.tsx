import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveShortcutBinding, resolveShortcutText, SHORTCUT_GROUPS, type ComposerCommand, type ShortcutBinding, type SkillShortcut } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Button, TooltipButton } from "../../components/ui";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import { useAppStore } from "../../stores/app-store";
import { RequirementsConfirmation } from "../requirements/RequirementsConfirmation";
import { loadShortcutConfiguration, useShortcutConfiguration } from "../extensions/shortcut-state";
export { CODING_SKILL_SHORTCUTS, CODING_MORE_SKILLS } from "@pi-desktop/shared";

export function CodingWorkbench({ disabled, error, onSelect }: {
  disabled: boolean; error: string | null; onSelect: (skill: ShortcutBinding, prompt: string) => void;
}) {
  const { t } = useTranslation();
  const projectPath = useAppStore(state => state.workspace?.path ?? "");
  const { configuration, error: configurationError } = useShortcutConfiguration();
  const [moreOpen, setMoreOpen] = useState(false);
  const [catalog, setCatalog] = useState<ComposerCommand[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setCatalog([]);
    void api.composerCommands().then(({ commands }) => { if (active) { setCatalog(commands); setCatalogError(null); } }).catch(cause => { if (active) setCatalogError(String(cause)); });
    return () => { active = false; };
  }, [projectPath, configuration]);
  useEffect(() => { void loadShortcutConfiguration(); }, []);
  useEffect(() => { if (disabled) setMoreOpen(false); }, [disabled]);
  const buttons = configuration?.buttons.filter(button => button.enabled) ?? [];
  const renderButton = (button: SkillShortcut, menu = false) => {
    const text = resolveShortcutText(button, t);
    let unavailable = catalogError ?? "";
    if (!unavailable) { try { resolveShortcutBinding(button.binding, catalog); } catch (cause) { unavailable = cause instanceof Error ? cause.message : String(cause); } }
    const note = unavailable ? `${unavailable}。请打开扩展设置重新绑定。` : text.note;
    return <TooltipButton key={button.id} disabled={disabled || Boolean(unavailable)} className={menu ? "btn btn-ghost context-menu-item" : "btn btn-secondary"}
      role={menu ? "menuitem" : undefined} ariaLabel={text.name} tooltip={note} aria-description={note}
      tooltipClassName="ui-tooltip-help coding-skill-tooltip" onClick={() => { setMoreOpen(false); onSelect(button.binding, text.prompt); }}>{text.name}</TooltipButton>;
  };
  return <section className="coding-workbench" aria-label={t("coding.tools")}>
    <div className="coding-shortcuts coding-shortcuts-primary">{buttons.filter(button => button.position === "primary").map(button => renderButton(button))}</div>
    <div className="coding-shortcuts coding-shortcuts-secondary">
      <Button variant="ghost" onClick={() => useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("workflow"))}>{t("coding.formal")}</Button>
      <RequirementsConfirmation projectPath={projectPath} disabled={disabled} />
      <AnchoredMenu open={moreOpen} onClose={() => setMoreOpen(false)} role="menu" side="top" restoreFocus={!disabled} label={t("coding.more")} menuClassName="context-menu coding-more-menu"
        trigger={ref => <Button ref={ref} type="button" variant="ghost" disabled={disabled} title={t("coding.moreHint")} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>{t("coding.more")}</Button>}>
        {SHORTCUT_GROUPS.map(group => <div key={group} role="group" aria-label={t(`coding.groups.${group}`)}>
          <div className="coding-menu-group-label" aria-hidden="true">{t(`coding.groups.${group}`)}</div>
          {buttons.filter(button => button.position === "more" && button.group === group).map(button => renderButton(button, true))}
        </div>)}
      </AnchoredMenu>
    </div>
    {buttons.some(button => { try { resolveShortcutBinding(button.binding, catalog); return false; } catch { return true; } }) && <div role="status">部分 Skill 在当前项目不可用或来源不明确。<Button onClick={() => { const store = useAppStore.getState(); store.setSettingsTab("extensions"); store.setPage("settings"); }}>配置快捷按钮</Button></div>}
    {(error || configurationError) && <div className="coding-shortcut-error" role="alert"><span>{error || configurationError}</span><Button onClick={() => {
      const store = useAppStore.getState(); store.setSettingsTab("extensions"); store.setPage("settings");
    }}>{t("coding.configureSkills")}</Button></div>}
  </section>;
}
