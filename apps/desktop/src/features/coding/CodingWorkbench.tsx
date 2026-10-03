import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Button, TooltipButton } from "../../components/ui";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import { useAppStore } from "../../stores/app-store";

import { CODING_SKILL_SHORTCUTS, CODING_MORE_SKILLS, resolveShortcutInstruction, type EngineeringShortcutAction } from "@pi-desktop/shared";
export { CODING_SKILL_SHORTCUTS, CODING_MORE_SKILLS } from "@pi-desktop/shared";

export function CodingWorkbench({ disabled, error, onSelect }: {
  disabled: boolean;
  error: string | null;
  onSelect: (skill: string, prompt: string) => void;
}) {
  const { t } = useTranslation();
  const overrides = useAppStore(state => state.settings?.engineeringShortcutPrompts);
  const selectShortcut = (action: EngineeringShortcutAction, skill: string) => onSelect(skill, resolveShortcutInstruction(action, t(`coding.prompts.${action}`), overrides));
  const [moreOpen, setMoreOpen] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);

  useEffect(() => {
    if (disabled) { setMoreOpen(false); setRequirementsOpen(false); }
  }, [disabled]);

  return <section className="coding-workbench" aria-label={t("coding.tools")}>
    <div className="coding-shortcuts">
      <Button disabled={disabled} title={t("coding.askHint")} onClick={() => selectShortcut("ask", "ask-matt")}>
        {t("coding.ask")}
      </Button>
      <Button disabled={disabled} title={t("coding.initializeHint")} onClick={() => selectShortcut("initialize", "setup-matt-pocock-skills")}>
        {t("coding.initialize")}
      </Button>
      <Button onClick={() => useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("workflow"))}>
        {t("coding.formal")}
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
            onClick={() => { setRequirementsOpen(false); setMoreOpen((value) => !value); }}
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
              selectShortcut(action, skill);
            }}
          >
            {t(`coding.${action}`)}
          </Button>
        ))}
      </AnchoredMenu>
    </div>
    <div className="coding-shortcuts coding-shortcuts-primary">
      {CODING_SKILL_SHORTCUTS.filter(({ action }) => action !== "initialize" && action !== "spec" && action !== "tickets").map(({ action, skill }) => action === "discovery" ? <div className="coding-requirements-split" key={skill}>
        <Button className="coding-shortcut-emphasized" disabled={disabled} title={t("coding.discoveryHint")} onClick={() => {
          setRequirementsOpen(false);
          selectShortcut(action, skill);
        }}>{t("coding.discovery")}</Button>
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
          {CODING_SKILL_SHORTCUTS.filter(({ action }) => action === "spec" || action === "tickets").map(({ action, skill }) => <Button
            key={skill} type="button" role="menuitem" variant="ghost"
            className="context-menu-item" disabled={disabled}
            title={t(`coding.${action}Hint`)}
            onClick={() => {
              setRequirementsOpen(false);
              selectShortcut(action, skill);
            }}
          >{t(`coding.${action}`)}</Button>)}
        </AnchoredMenu>
      </div> : <Button
        key={skill} disabled={disabled} title={t(`coding.${action}Hint`)}
        className={["implement", "diagnose"].includes(action) ? "coding-shortcut-emphasized" : undefined}
        onClick={() => selectShortcut(action, skill)}
      >{t(`coding.${action}`)}</Button>)}
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
