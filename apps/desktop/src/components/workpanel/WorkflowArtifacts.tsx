import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { WORKFLOW_STAGES, type ProjectGroupRoot, type WorkflowArtifactReference, type WorkflowProjectHistory, type WorkflowRun, type WorkflowStageId } from "@pi-desktop/shared";
import { useWorkflowArtifacts } from "../../hooks/use-workflow-artifacts";
import { Button, Field, Input, Select } from "../ui";

import { WorkflowArtifactList } from "./WorkflowArtifactList";

const KINDS: WorkflowArtifactReference["kind"][] = ["glossary", "adr", "spec", "ticket", "review", "retro"];

export function WorkflowArtifacts({ groupId, run, revision, roots, readOnly, onHistory }: {
  groupId: string; run: WorkflowRun; revision?: number; roots: ProjectGroupRoot[]; readOnly?: boolean; onHistory: (history: WorkflowProjectHistory) => void;
}) {
  const { t } = useTranslation();
  const artifacts = useWorkflowArtifacts(groupId, run.id, revision, onHistory);
  const [kind, setKind] = useState<WorkflowArtifactReference["kind"]>("glossary");
  const [stageId, setStageId] = useState<WorkflowStageId>("discovery");
  const [root, setRoot] = useState(roots[0]?.path ?? "");
  const [path, setPath] = useState("");
  const [ticket, setTicket] = useState("");
  const stage = run.stages.find((value) => value.id === stageId);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stage || revision === undefined || !roots.some((value) => value.path === root)) return;
    const saved = await artifacts.register({ projectGroupId: groupId, runId: run.id, stageId, stageRevision: stage.revision, kind, workspaceRoot: root, relativePath: path, ticketId: ticket.trim() || null, expectedRevision: revision });
    if (saved) { setPath(""); setTicket(""); }
  };
  return <section className="workflow-artifacts" aria-label={t("panel.workflow.artifacts.title")}>
    <div className="workflow-run-heading"><h4>{t("panel.workflow.artifacts.title")}</h4><Button type="button" size="sm" onClick={() => void artifacts.refresh()} disabled={artifacts.busy}>{t("panel.workflow.refresh")}</Button></div>
    <p>{t("panel.workflow.artifacts.unverified")}</p>
    {!readOnly && run.outcome === "active" ? <form className="workflow-artifact-form" onSubmit={(event) => void submit(event)}>
      <Field label={t("panel.workflow.artifacts.type")}><Select value={kind} aria-label={t("panel.workflow.artifacts.type")} onChange={(event) => setKind(event.currentTarget.value as WorkflowArtifactReference["kind"])}>{KINDS.map((value) => <option key={value} value={value}>{t(`panel.workflow.artifacts.kinds.${value}`)}</option>)}</Select></Field>
      <Field label={t("panel.workflow.artifacts.stage")}><Select value={stageId} aria-label={t("panel.workflow.artifacts.stage")} onChange={(event) => setStageId(event.currentTarget.value as WorkflowStageId)}>{WORKFLOW_STAGES.map((value) => <option key={value.id} value={value.id}>{t(`panel.workflow.stages.${value.id}`)}</option>)}</Select></Field>
      <Field label={t("panel.workflow.artifacts.root")}><Select value={root} aria-label={t("panel.workflow.artifacts.root")} onChange={(event) => setRoot(event.currentTarget.value)}>{roots.map((value) => <option key={value.path} value={value.path}>{value.name}</option>)}</Select></Field>
      <Field label={t("panel.workflow.artifacts.path")}><Input value={path} aria-label={t("panel.workflow.artifacts.path")} onChange={(event) => setPath(event.currentTarget.value)} required maxLength={8192} placeholder={t("panel.workflow.artifacts.pathHint")} /></Field>
      <Field label={t("panel.workflow.artifacts.ticket")}><Input value={ticket} aria-label={t("panel.workflow.artifacts.ticket")} onChange={(event) => setTicket(event.currentTarget.value)} maxLength={256} /></Field>
      <Button type="submit" variant="primary" disabled={artifacts.busy || !path || !roots.some((value) => value.path === root) || revision === undefined}>{t("panel.workflow.artifacts.register")}</Button>
    </form> : null}
    {artifacts.error ? <p role="alert">{t("panel.workflow.requestError", { details: artifacts.error })}</p> : null}
    <WorkflowArtifactList entries={artifacts.entries} busy={artifacts.busy} onOpen={artifacts.open} />
  </section>;
}
