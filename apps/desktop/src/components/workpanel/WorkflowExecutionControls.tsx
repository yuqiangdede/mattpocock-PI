import { useTranslation } from "react-i18next";
import { WORKFLOW_STAGES, type WorkflowRun } from "@pi-desktop/shared";
import type { useWorkflowExecution } from "../../hooks/use-workflow-execution";
import { Button } from "../ui";
import { useState } from "react";
import { WorkflowReopenDialog } from "./WorkflowReopenDialog";
import { WorkflowExecutionHistory } from "./WorkflowExecutionHistory";

export function WorkflowExecutionControls({ workflow, run }: { workflow: ReturnType<typeof useWorkflowExecution>; run: WorkflowRun }) {
  const { t } = useTranslation();
  const [reopening, setReopening] = useState<{ stageId: typeof workflow.stageId; revision: number } | null>(null);
  const definition = WORKFLOW_STAGES.find((stage) => stage.id === workflow.stageId)!;
  const label = t(`panel.workflow.stages.${workflow.stageId}`);
  return <>
    {run.outcome === "active" ? <div className="workflow-discovery">
      <h4>{label}</h4>
      <p>{t("panel.workflow.execution.skill", { name: definition.skillId })}</p>
      {!workflow.unsettled ? <>
        <Button type="button" variant="primary" onClick={() => void workflow.start()} disabled={workflow.starting || !workflow.status?.ready}>
          {t(workflow.starting ? "panel.workflow.execution.pending" : workflow.latest?.phase === "normal" ? "panel.workflow.execution.continue" : workflow.latest ? "panel.workflow.execution.retry" : "panel.workflow.execution.startStage", { stage: label })}
        </Button>
        {!workflow.status && !workflow.error ? <p role="status">{t("panel.workflow.execution.checking")}</p> : null}
        {workflow.status?.blocker ? <p role="status">{t(`panel.workflow.execution.blockers.${workflow.status.blocker.code}`, { name: definition.skillId, defaultValue: t("panel.workflow.execution.blockers.WORKFLOW_UNAVAILABLE") })}</p> : null}
      </> : <Button type="button" onClick={() => void workflow.stop()} disabled={workflow.starting}>{t("panel.workflow.execution.stop")}</Button>}
      {workflow.latest ? <p role="status" data-workflow-execution-phase={workflow.latest.phase}>
        {t(`panel.workflow.execution.${workflow.latest.phase}`)}
        {workflow.stage?.awaitingConfirmation ? ` · ${t("panel.workflow.execution.awaiting")}` : ""}
      </p> : null}
      {workflow.stage?.awaitingConfirmation ? <Button type="button" onClick={() => void workflow.accept()} disabled={workflow.starting || workflow.unsettled || workflow.boundBusy}>
        {t(workflow.stageId === "review" ? "panel.workflow.execution.acceptReview" : workflow.stageId === "implement" ? "panel.workflow.execution.acceptImplement" : "panel.workflow.execution.accept", { stage: label })}
      </Button> : null}
      {workflow.error ? <p role="alert" className="workflow-error">{t("panel.workflow.requestError", { details: workflow.error })}</p> : null}
      <div className="workflow-reopen-actions">
        {run.stages.filter((stage) => stage.acceptance).map((stage) => <Button key={stage.id} type="button" size="sm" disabled={workflow.unsettled || workflow.starting || workflow.runBoundBusy || workflow.revision === undefined}
          onClick={() => setReopening({ stageId: stage.id, revision: workflow.revision! })}>
          {t("panel.workflow.reopen.action", { stage: t(`panel.workflow.stages.${stage.id}`) })}
        </Button>)}
        {workflow.stageId === "review" ? <Button type="button" disabled={workflow.unsettled || workflow.starting || workflow.runBoundBusy || workflow.revision === undefined}
          onClick={() => setReopening({ stageId: "implement", revision: workflow.revision! })}>{t("panel.workflow.reopen.returnToImplement")}</Button> : null}
      </div>
    </div> : null}
    <WorkflowExecutionHistory run={run} />
    {reopening && run.outcome === "active" ? <WorkflowReopenDialog stageId={reopening.stageId} busy={workflow.starting} error={workflow.error} onClose={() => setReopening(null)} onConfirm={async () => { if (await workflow.reopen(reopening.stageId, reopening.revision)) setReopening(null); }} /> : null}
  </>;
}
