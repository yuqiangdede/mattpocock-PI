import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui";
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

export function CodingWorkbench({ disabled, error, onSelect }: {
  disabled: boolean;
  error: string | null;
  onSelect: (skill: string) => void;
}) {
  const { t } = useTranslation();
  return <section className="coding-workbench" aria-label={t("coding.tools")}>
    <div className="coding-shortcuts">
      {CODING_SKILL_SHORTCUTS.map(({ action, skill }) => <Button
        key={skill} disabled={disabled} title={t(`coding.${action}Hint`)}
        onClick={() => onSelect(skill)}
      >{t(`coding.${action}`)}</Button>)}
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
