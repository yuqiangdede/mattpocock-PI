import { useTranslation } from "react-i18next";
import type { WorkflowArtifactEntry } from "@pi-desktop/shared";
import { Badge, Button } from "../ui";

export function WorkflowArtifactList({ entries, busy, onOpen }: { entries: WorkflowArtifactEntry[]; busy: boolean; onOpen: (id: string) => Promise<void> }) {
  const { t } = useTranslation();
  return <>
    {entries.length === 0 ? <p>{t("panel.workflow.artifacts.empty")}</p> : <ul className="workflow-artifact-list">
      {entries.map(({ reference, historical, availability }) => <li key={reference.id} data-workflow-artifact-id={reference.id} data-artifact-availability={availability}>
        <span>{reference.relativePath}</span>
        <span>{t(`panel.workflow.artifacts.kinds.${reference.kind}`)} · {t(`panel.workflow.stages.${reference.stageId}`)} · {t("panel.workflow.artifacts.revision", { revision: reference.stageRevision })}</span>
        <Badge>{t(historical ? "panel.workflow.reopen.historical" : "panel.workflow.reopen.current")}</Badge>
        <span role="status">{t(`panel.workflow.artifacts.availability.${availability}`)}</span>
        {reference.ticketId ? <span>{t("panel.workflow.artifacts.ticketValue", { ticket: reference.ticketId })}</span> : null}
        <Button type="button" size="sm" aria-label={t("panel.workflow.artifacts.openNamed", { path: reference.relativePath })} disabled={busy || availability !== "available"} onClick={() => void onOpen(reference.id)}>{t("panel.workflow.artifacts.open")}</Button>
      </li>)}
    </ul>}
  </>;
}
