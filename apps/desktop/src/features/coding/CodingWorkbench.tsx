import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveShortcutText, SHORTCUT_GROUPS, type SkillShortcut } from "@pi-desktop/shared";
import { Button, TooltipButton } from "../../components/ui";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import { useAppStore } from "../../stores/app-store";
import { RequirementsConfirmation } from "../requirements/RequirementsConfirmation";
import { loadShortcutConfiguration, useShortcutConfiguration } from "../extensions/shortcut-state";
export { CODING_SKILL_SHORTCUTS, CODING_MORE_SKILLS } from "@pi-desktop/shared";

export function CodingWorkbench({ disabled, error, onSelect }: {
  disabled: boolean; error: string | null; onSelect: (skill: string, prompt: string) => void;
}) {
  const { t } = useTranslation();
  const projectPath = useAppStore(state => state.workspace?.path ?? "");
  const { configuration, error: configurationError } = useShortcutConfiguration();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { void loadShortcutConfiguration(); }, []);
  useEffect(() => { if (disabled) setMoreOpen(false); }, [disabled]);
  const buttons = configuration?.buttons.filter(button => button.enabled) ?? [];
  const renderButton = (button: SkillShortcut, menu = false) => {
    const text = resolveShortcutText(button, t);
    return <TooltipButton key={button.id} disabled={disabled} className={menu ? "btn btn-ghost context-menu-item" : "btn btn-secondary"}
      role={menu ? "menuitem" : undefined} ariaLabel={text.name} tooltip={text.note} aria-description={text.note}
      tooltipClassName="ui-tooltip-help coding-skill-tooltip" onClick={() => { setMoreOpen(false); onSelect(button.binding.skillId, text.prompt); }}>{text.name}</TooltipButton>;
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
    {(error || configurationError) && <div className="coding-shortcut-error" role="alert"><span>{error || configurationError}</span><Button onClick={() => {
      const store = useAppStore.getState(); store.setSettingsTab(configurationError ? "extensions" : "skills"); store.setPage("settings");
    }}>{t("coding.configureSkills")}</Button></div>}
  </section>;
}
