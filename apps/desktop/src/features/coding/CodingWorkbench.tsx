import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Button, TooltipButton } from "../../components/ui";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import { useAppStore } from "../../stores/app-store";

import { CODING_SKILL_SHORTCUTS, CODING_MORE_SKILLS, resolveShortcutInstruction, type EngineeringShortcutAction } from "@pi-desktop/shared";
export { CODING_SKILL_SHORTCUTS, CODING_MORE_SKILLS } from "@pi-desktop/shared";

const MORE_GROUPS = [
  { label: "exploration", actions: ["grillMe", "grilling", "research", "questionnaire", "prototype"] },
  { label: "maintenance", actions: ["tdd", "triage", "resolveConflicts", "improveArchitecture", "codebaseDesign", "domainModeling", "wayfinder"] },
  { label: "collaboration", actions: ["retro", "handoff", "teach", "waitWhat", "writingForAgents", "wizard"] },
  { label: "projectSetup", actions: ["initialize"] },
] as const;
const moreSkills = [...CODING_SKILL_SHORTCUTS, ...CODING_MORE_SKILLS];

export function CodingWorkbench({ disabled, error, onSelect }: {
  disabled: boolean;
  error: string | null;
  onSelect: (skill: string, prompt: string) => void;
}) {
  const { t } = useTranslation();
  const skillTooltip = (action: EngineeringShortcutAction) => (["when", "purpose", "example"] as const)
    .map(section => `${t(`settings.engineering.${section}`)}: ${t(`coding.skillGuides.${action}.${section}`)}`)
    .join("\n\n");
  const overrides = useAppStore(state => state.settings?.engineeringShortcutPrompts);
  const selectShortcut = (action: EngineeringShortcutAction, skill: string) => onSelect(skill, resolveShortcutInstruction(action, t(`coding.prompts.${action}`), overrides));
  const [moreOpen, setMoreOpen] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);

  useEffect(() => {
    if (disabled) { setMoreOpen(false); setRequirementsOpen(false); }
  }, [disabled]);

  return <section className="coding-workbench" aria-label={t("coding.tools")}>
    <div className="coding-shortcuts coding-shortcuts-primary">
      <TooltipButton disabled={disabled} className="btn btn-secondary" ariaLabel={t("coding.ask")}
        tooltip={skillTooltip("ask")} aria-description={skillTooltip("ask")} tooltipClassName="ui-tooltip-help coding-skill-tooltip"
        onClick={() => selectShortcut("ask", "ask-matt")}>
        {t("coding.ask")}
      </TooltipButton>

      {CODING_SKILL_SHORTCUTS.filter(({ action }) => action !== "initialize" && action !== "spec" && action !== "tickets" && action !== "retro").map(({ action, skill }) => action === "discovery" ? <div className="coding-requirements-split" key={skill}>
        <TooltipButton disabled={disabled} className="btn btn-secondary" ariaLabel={t("coding.discovery")}
          tooltip={skillTooltip(action)} aria-description={skillTooltip(action)} tooltipClassName="ui-tooltip-help coding-skill-tooltip" onClick={() => {
          setRequirementsOpen(false);
          selectShortcut(action, skill);
        }}>{t("coding.discovery")}</TooltipButton>
        <AnchoredMenu
          open={requirementsOpen}
          onClose={() => setRequirementsOpen(false)}
          role="menu"
          side="top"
          restoreFocus={!disabled}
          label={`${t("coding.discovery")} · ${t("coding.more")}`}
          menuClassName="context-menu coding-requirements-menu"
          trigger={(ref) => <TooltipButton
            ref={ref} type="button" disabled={disabled}
            className="btn btn-secondary"
            tooltip={`${t("coding.discovery")} · ${t("coding.more")}`}
            aria-haspopup="menu" aria-expanded={requirementsOpen}
            onClick={() => {
              setMoreOpen(false);
              setRequirementsOpen((value) => !value);
            }}
          ><ChevronDown size={14} aria-hidden="true" /></TooltipButton>}
        >
          {CODING_SKILL_SHORTCUTS.filter(({ action }) => action === "spec" || action === "tickets").map(({ action, skill }) => <TooltipButton
            key={skill} type="button" role="menuitem"
            className="btn btn-ghost context-menu-item" disabled={disabled} ariaLabel={t(`coding.${action}`)}
            tooltip={skillTooltip(action)} aria-description={skillTooltip(action)} tooltipClassName="ui-tooltip-help coding-skill-tooltip"
            onClick={() => {
              setRequirementsOpen(false);
              selectShortcut(action, skill);
            }}
          >{t(`coding.${action}`)}</TooltipButton>)}
        </AnchoredMenu>
      </div> : <TooltipButton
        key={skill} disabled={disabled} className="btn btn-secondary" ariaLabel={t(`coding.${action}`)}
        tooltip={skillTooltip(action)} aria-description={skillTooltip(action)} tooltipClassName="ui-tooltip-help coding-skill-tooltip"
        onClick={() => selectShortcut(action, skill)}
      >{t(`coding.${action}`)}</TooltipButton>)}
    </div>
    <div className="coding-shortcuts coding-shortcuts-secondary">
      <Button variant="ghost" onClick={() => useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("workflow"))}>
        {t("coding.formal")}
      </Button>
      <AnchoredMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        role="menu"
        side="top"
        restoreFocus={!disabled}
        label={t("coding.more")}
        menuClassName="context-menu coding-more-menu"
        trigger={(ref) => (
          <Button
            ref={ref}
            type="button"
            variant="ghost"
            disabled={disabled}
            title={t("coding.moreHint")}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => { setRequirementsOpen(false); setMoreOpen((value) => !value); }}
          >
            {t("coding.more")}
          </Button>
        )}
      >
        {MORE_GROUPS.map(({ label, actions }) => <div key={label} role="group" aria-label={t(`coding.groups.${label}`)}>
          <div className="coding-menu-group-label" aria-hidden="true">{t(`coding.groups.${label}`)}</div>
          {actions.map(action => moreSkills.find(entry => entry.action === action)).map(entry => entry && <TooltipButton
            key={entry.skill} type="button" role="menuitem"
            className="btn btn-ghost context-menu-item" disabled={disabled} ariaLabel={t(`coding.${entry.action}`)}
            tooltip={skillTooltip(entry.action)} aria-description={skillTooltip(entry.action)} tooltipClassName="ui-tooltip-help coding-skill-tooltip"
            onClick={() => {
              setMoreOpen(false);
              selectShortcut(entry.action, entry.skill);
            }}
          >{t(`coding.${entry.action}`)}</TooltipButton>)}
        </div>)}
      </AnchoredMenu>
    </div>
    {error && <div className="coding-shortcut-error" role="alert">
      <span>{error}</span>
      <Button onClick={() => {
        const store = useAppStore.getState();
        store.setSettingsTab("skills");
        store.setPage("settings");
      }}>{t("coding.configureSkills")}</Button>
    </div>}
  </section>;
}
