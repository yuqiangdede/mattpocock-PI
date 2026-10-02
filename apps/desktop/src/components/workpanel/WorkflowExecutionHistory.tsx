import { useTranslation } from "react-i18next";
import type { WorkflowRun } from "@pi-desktop/shared";

export function WorkflowExecutionHistory({ run }: { run: WorkflowRun }) {
  const { t } = useTranslation();
  const historical = (stageId: string, revision: number) => run.stages.find((stage) => stage.id === stageId)?.revision !== revision;
  return <>
    <ol aria-label={t("panel.workflow.execution.attempts")}>
      {run.executions.map((execution) => <li key={execution.id} data-workflow-historical={historical(execution.stageId, execution.stageRevision)}>
        {t(`panel.workflow.stages.${execution.stageId}`)} · {t(`panel.workflow.execution.${execution.phase}`)} · {execution.sessionId}
        {historical(execution.stageId, execution.stageRevision) ? ` · ${t("panel.workflow.reopen.historical")}` : ""}
      </li>)}
    </ol>
    {run.stages.flatMap((stage) => stage.acceptanceHistory.map((acceptance) => <p key={`${stage.id}:${acceptance.stageRevision}`}>
      {t("panel.workflow.reopen.priorAcceptance", { stage: t(`panel.workflow.stages.${stage.id}`), revision: acceptance.stageRevision })}
    </p>))}
  </>;
}
