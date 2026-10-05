import { useTranslation } from "react-i18next";
import type { EngineeringShortcutAction } from "@pi-desktop/shared";

export function EngineeringSkillDescription({ action }: { action: EngineeringShortcutAction }) {
  const { t } = useTranslation();
  return (
    <dl className="engineering-skill-description">
      {(["when", "purpose", "example"] as const).map(section => (
        <div key={section}>
          <dt className="field-label">{t(`settings.engineering.${section}`)}</dt>
          <dd>{t(`coding.skillGuides.${action}.${section}`)}</dd>
        </div>
      ))}
    </dl>
  );
}
