import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { WORKFLOW_STAGES, type WorkflowStageId } from "@pi-desktop/shared";
import { useBlockingOverlay } from "../../lib/blocking-overlay";
import { Button } from "../ui";

export function WorkflowReopenDialog({ stageId, busy, error, onClose, onConfirm }: {
  stageId: WorkflowStageId; busy: boolean; error: string | null; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useBlockingOverlay();
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);
  const affected = WORKFLOW_STAGES.slice(WORKFLOW_STAGES.findIndex((stage) => stage.id === stageId));
  return <dialog ref={dialog} className="workflow-reopen-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <h3 id={titleId}>{t("panel.workflow.reopen.title", { stage: t(`panel.workflow.stages.${stageId}`) })}</h3>
    <p id={descriptionId}>{t("panel.workflow.reopen.description")}</p>
    <ul>{affected.map((stage) => <li key={stage.id}>{t(`panel.workflow.stages.${stage.id}`)}</li>)}</ul>
    {error ? <p role="alert">{t("panel.workflow.requestError", { details: error })}</p> : null}
    <div className="workflow-reopen-actions">
      <Button type="button" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
      <Button type="button" variant="primary" onClick={() => void onConfirm()} disabled={busy}>{t("panel.workflow.reopen.confirm")}</Button>
    </div>
  </dialog>;
}
