import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import { useAppStore } from "../../stores/app-store";

export const CODING_SKILL_SHORTCUTS = [
  { action: "initialize", skill: "setup-matt-pocock-skills" },
  { action: "discovery", skill: "grill-with-docs" },
  { action: "spec", skill: "to-spec" },
  { action: "tickets", skill: "to-tickets" },
  { action: "implement", skill: "implement" },
  { action: "diagnose", skill: "diagnosing-bugs" },
  { action: "review", skill: "code-review" },
  { action: "retro", skill: "retro" },
] as const;

/** Matt skills that are useful from the coding workbench but do not need a visible shortcut. */
export const CODING_MORE_SKILLS = [
  { action: "grillMe", skill: "grill-me" },
  { action: "grilling", skill: "grilling" },
  { action: "handoff", skill: "handoff" },
  { action: "prototype", skill: "prototype" },
  { action: "improveArchitecture", skill: "improve-codebase-architecture" },
  { action: "codebaseDesign", skill: "codebase-design" },
  { action: "domainModeling", skill: "domain-modeling" },
  { action: "tdd", skill: "tdd" },
  { action: "wayfinder", skill: "wayfinder" },
  { action: "triage", skill: "triage" },
  { action: "research", skill: "research" },
  { action: "resolveConflicts", skill: "resolving-merge-conflicts" },
  { action: "teach", skill: "teach" },
  { action: "questionnaire", skill: "to-questionnaire" },
  { action: "waitWhat", skill: "wait-what" },
  { action: "wizard", skill: "wizard" },
  { action: "writingForAgents", skill: "writing-for-agents" },
] as const;

export function CodingWorkbench({ disabled, error, onSelect }: {
  disabled: boolean;
  error: string | null;
  onSelect: (skill: string) => void;
}) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (disabled) setMoreOpen(false);
  }, [disabled]);

  return <section className="coding-workbench" aria-label={t("coding.tools")}>
    <div className="coding-shortcuts">
      {CODING_SKILL_SHORTCUTS.map(({ action, skill }) => <Button
        key={skill} disabled={disabled} title={t(`coding.${action}Hint`)}
        onClick={() => onSelect(skill)}
      >{t(`coding.${action}`)}</Button>)}
      <Button disabled={disabled} title={t("coding.askHint")} onClick={() => onSelect("ask-matt")}>
        {t("coding.ask")}
      </Button>
      <AnchoredMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        role="menu"
        label={t("coding.more")}
        menuClassName="context-menu coding-more-menu"
        trigger={(ref) => (
          <Button
            ref={ref}
            type="button"
            disabled={disabled}
            title={t("coding.moreHint")}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((value) => !value)}
          >
            {t("coding.more")}
          </Button>
        )}
      >
        {CODING_MORE_SKILLS.map(({ action, skill }) => (
          <Button
            key={skill}
            type="button"
            role="menuitem"
            variant="ghost"
            className="context-menu-item"
            disabled={disabled}
            onClick={() => {
              setMoreOpen(false);
              onSelect(skill);
            }}
          >
            {t(`coding.${action}`)}
          </Button>
        ))}
      </AnchoredMenu>
      <Button onClick={() => useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("workflow"))}>
        {t("coding.formal")}
      </Button>
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
