import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProjectGroupRecord,
  WorkflowProjectHistory,
  WorkflowRun,
  WorkflowStageId,
  WorkflowStage,
} from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { normalizeProjectPath } from "../../lib/sidebar-session-groups";
import { projectIsArchived, type ProjectMeta } from "../../lib/sidebar-preferences";
import { Badge, Button, Field, Input } from "../ui";
import { useWorkflowExecution } from "../../hooks/use-workflow-execution";
import { WorkflowExecutionControls } from "./WorkflowExecutionControls";
import { WorkflowExecutionHistory } from "./WorkflowExecutionHistory";
import { WorkflowArtifacts } from "./WorkflowArtifacts";
import { WORKFLOW_STAGES } from "@pi-desktop/shared";
import { RequirementsConfirmation } from "../../features/requirements/RequirementsConfirmation";

const STAGES = WORKFLOW_STAGES.map((stage) => stage.id);

function replaceHistory(
  histories: WorkflowProjectHistory[],
  next: WorkflowProjectHistory,
): WorkflowProjectHistory[] {
  const current = histories.find((item) => item.projectGroupId === next.projectGroupId);
  if (current && current.revision > next.revision) return histories;
  return [...histories.filter((item) => item.projectGroupId !== next.projectGroupId), next];
}

function WorkflowStageList({
  run,
  stageLabel,
  statusLabel,
  lockedLabel,
}: {
  run: WorkflowRun;
  stageLabel: (id: WorkflowStageId) => string;
  statusLabel: (status: WorkflowStage["status"]) => string;
  lockedLabel: (stage: string) => string;
}) {
  return (
    <ol className="workflow-stages">
      {STAGES.map((id) => {
        const stage = run.stages.find((item) => item.id === id);
        if (!stage) return null;
        return (
          <li key={id} data-stage-status={stage.status}>
            <div>
              <strong>{stageLabel(id)}</strong>
              {stage.status === "locked" && stage.prerequisite ? (
                <p>{lockedLabel(stageLabel(stage.prerequisite))}</p>
              ) : null}
            </div>
            <Badge tone={stage.status === "ready" ? "success" : "neutral"}>
              {statusLabel(stage.status)}
            </Badge>
          </li>
        );
      })}
    </ol>
  );
}

export function WorkflowTab({
  projectPath,
  projectMeta,
  sessionId,
}: {
  projectPath?: string;
  projectMeta: Record<string, ProjectMeta>;
  sessionId?: string;
}) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<ProjectGroupRecord[]>([]);
  const [histories, setHistories] = useState<WorkflowProjectHistory[]>([]);
  const [title, setTitle] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailableHistory, setUnavailableHistory] = useState<WorkflowProjectHistory | null>(null);
  const [unavailableRunId, setUnavailableRunId] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const contextGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const currentProjectPath = useRef(projectPath);
  currentProjectPath.current = projectPath;

  const projectGroup = useMemo(() => {
    const key = projectPath ? normalizeProjectPath(projectPath) : "";
    if (!key) return undefined;
    return groups.find((group) =>
      group.roots.some((root) => normalizeProjectPath(root.path) === key),
    );
  }, [groups, projectPath]);
  const projectGroupArchived = Boolean(
    projectGroup && projectIsArchived(projectGroup.primaryPath, projectMeta),
  );
  const currentProjectGroupId = useRef<string | undefined>(undefined);
  currentProjectGroupId.current = projectGroupArchived ? undefined : projectGroup?.id;
  const history = projectGroup && !projectGroupArchived
    ? histories.find((item) => item.projectGroupId === projectGroup.id) ?? {
        projectGroupId: projectGroup.id,
        projectName: projectGroup.name,
        available: true,
        revision: 0,
        runs: [],
      }
    : undefined;
  const selectedRun = history?.runs.find((run) => run.id === selectedRunId)
    ?? history?.runs.at(-1);
  const selectedUnavailableRun = unavailableHistory?.runs.find(
    (run) => run.id === unavailableRunId,
  );
  const activeRun = history?.runs.find((run) => run.outcome === "active");
  const publishHistory = useCallback((next: WorkflowProjectHistory) => {
    setHistories((current) => replaceHistory(current, next));
  }, []);
  const workflow = useWorkflowExecution({
    groupId: projectGroupArchived ? undefined : projectGroup?.id,
    run: selectedRun,
    revision: history?.revision,
    sessionId,
    onHistory: publishHistory,
  });
  const unavailableHistories = histories
    .map((item) => {
      const group = groups.find((candidate) => candidate.id === item.projectGroupId);
      const archived = group && projectIsArchived(group.primaryPath, projectMeta);
      return item.available && archived ? { ...item, available: false } : item;
    })
    .filter((item) => !item.available && (item.runs.length > 0 || item.error));

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const [groupResult, historyResult] = await Promise.all([
        api.listProjectGroups(),
        api.listWorkflowHistories(),
      ]);
      if (generation === loadGeneration.current) {
        setGroups(groupResult.groups);
        setHistories(historyResult.histories);
        setSelectedRunId(null);
        setUnavailableHistory(null);
        setUnavailableRunId(null);
      }
    } catch (cause) {
      if (generation === loadGeneration.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    contextGeneration.current += 1;
    selectionGeneration.current += 1;
    setBusy(false);
    setTitle("");
    setUnavailableHistory(null);
    setUnavailableRunId(null);
    void load();
    return () => {
      loadGeneration.current += 1;
      contextGeneration.current += 1;
      selectionGeneration.current += 1;
    };
  }, [load, projectPath]);

  const createRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectGroup || projectGroupArchived || !history || history.error || busy || !title.trim()) return;
    const groupId = projectGroup.id;
    const context = contextGeneration.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.createWorkflowRun(groupId, title, history.revision);
      if (contextGeneration.current !== context || currentProjectGroupId.current !== groupId) return;
      setHistories((current) => replaceHistory(current, result.history));
      setSelectedRunId(result.history.runs.at(-1)?.id ?? null);
      setTitle("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (contextGeneration.current !== context || currentProjectGroupId.current !== groupId) return;
      await load();
      if (contextGeneration.current === context && currentProjectGroupId.current === groupId) {
        setError(message);
      }
    } finally {
      if (contextGeneration.current === context) setBusy(false);
    }
  };

  const archiveRun = async () => {
    if (!projectGroup || projectGroupArchived || !history || !activeRun || busy) return;
    const groupId = projectGroup.id;
    const context = contextGeneration.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.archiveWorkflowRun(
        groupId,
        activeRun.id,
        history.revision,
      );
      if (contextGeneration.current !== context || currentProjectGroupId.current !== groupId) return;
      setHistories((current) => replaceHistory(current, result.history));
      setSelectedRunId(activeRun.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (contextGeneration.current !== context || currentProjectGroupId.current !== groupId) return;
      await load();
      if (contextGeneration.current === context && currentProjectGroupId.current === groupId) {
        setError(message);
      }
    } finally {
      if (contextGeneration.current === context) setBusy(false);
    }
  };

  const selectRun = async (run: WorkflowRun) => {
    if (!projectGroup || run.id === selectedRunId) return;
    const groupId = projectGroup.id;
    const context = contextGeneration.current;
    const selection = ++selectionGeneration.current;
    try {
      const result = await api.readWorkflowHistory(groupId);
      if (
        contextGeneration.current !== context
        || selectionGeneration.current !== selection
        || currentProjectGroupId.current !== groupId
      ) return;
      setHistories((current) => replaceHistory(current, result.history));
      setSelectedRunId(run.id);
      setError(null);
    } catch (cause) {
      if (contextGeneration.current === context && selectionGeneration.current === selection) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  };

  const selectUnavailableRun = async (projectGroupId: string, run: WorkflowRun) => {
    const context = contextGeneration.current;
    const selection = ++selectionGeneration.current;
    try {
      const result = await api.readWorkflowHistory(projectGroupId);
      if (
        contextGeneration.current !== context
        || selectionGeneration.current !== selection
        || projectPath !== currentProjectPath.current
      ) return;
      setUnavailableHistory(result.history);
      setUnavailableRunId(run.id);
      setError(null);
    } catch (cause) {
      if (contextGeneration.current === context && selectionGeneration.current === selection) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  };

  const stageLabel = (id: WorkflowStageId) => t(`panel.workflow.stages.${id}`);

  return (
    <div className="work-panel-tabpane workflow-tab" data-testid="workflow-tab">
      <header className="workflow-header">
        <div>
          <h2>{t("panel.workflow.title")}</h2>
          {projectGroup ? (
            <p>{t("panel.workflow.project", { name: projectGroup.name })}</p>
          ) : null}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => void load()} disabled={loading || busy}>
          {t("panel.workflow.refresh")}
        </Button>
      </header>

      {loading ? <p role="status">{t("panel.workflow.loading")}</p> : null}
      {error ? (
        <p className="workflow-error" role="alert">
          {t("panel.workflow.requestError", { details: error })}
        </p>
      ) : null}
      {!loading && !projectPath ? <p>{t("panel.workflow.openProject")}</p> : null}
      {!loading && projectPath && (!projectGroup || projectGroupArchived) ? (
        <p>{t("panel.workflow.projectUnavailable")}</p>
      ) : null}

      {projectGroup && !projectGroupArchived ? (
        <section className="workflow-project" aria-label={t("panel.workflow.title")}>
          <RequirementsConfirmation projectPath={projectPath ?? ""} />
          {history?.error ? (
            <div className="workflow-error" role="alert">
              <p>{t("panel.workflow.documentError", { details: history.error })}</p>
              <Button type="button" onClick={() => void load()}>{t("panel.workflow.reload")}</Button>
            </div>
          ) : null}

          {history && !history.error ? (
            <>
              <form className="workflow-create" onSubmit={(event) => void createRun(event)}>
                <Field label={t("panel.workflow.runTitle")}>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.currentTarget.value)}
                    placeholder={t("panel.workflow.runTitlePlaceholder")}
                    maxLength={120}
                    required
                    aria-label={t("panel.workflow.runTitle")}
                    disabled={busy || Boolean(activeRun)}
                  />
                </Field>
                <Button type="submit" variant="primary" disabled={busy || Boolean(activeRun) || !title.trim()}>
                  {t("panel.workflow.createRun")}
                </Button>
              </form>

              {history.runs.length === 0 ? <p>{t("panel.workflow.noRuns")}</p> : (
                <div className="workflow-content">
                  <nav className="workflow-history" aria-label={t("panel.workflow.history")}>
                    <h3>{t("panel.workflow.history")}</h3>
                    {history.runs.map((run) => (
                      <Button
                        key={run.id}
                        type="button"
                        variant="ghost"
                        aria-pressed={selectedRun?.id === run.id}
                        className="workflow-run-choice"
                        onClick={() => void selectRun(run)}
                      >
                        <span>{run.title}</span>
                        <Badge tone={run.outcome === "active" ? "success" : "neutral"}>
                          {t(`panel.workflow.outcomes.${run.outcome}`)}
                        </Badge>
                      </Button>
                    ))}
                  </nav>

                  {selectedRun ? (
                    <article className="workflow-run" aria-label={selectedRun.title}>
                      <div className="workflow-run-heading">
                        <h3>{selectedRun.title}</h3>
                        {selectedRun.outcome === "active" ? <Button type="button" size="sm" onClick={() => void archiveRun()} disabled={busy || workflow.unsettled}>
                          {t("panel.workflow.archiveRun")}
                        </Button> : <Badge>{t("panel.workflow.readOnly")}</Badge>}
                      </div>
                      <WorkflowExecutionControls key={`${history.projectGroupId}:${selectedRun.id}`} workflow={workflow} run={selectedRun} />
                      <WorkflowStageList
                        run={selectedRun}
                        stageLabel={stageLabel}
                        statusLabel={(status) => t(`panel.workflow.stageStatus.${status}`)}
                        lockedLabel={(stage) => t("panel.workflow.lockedUntil", { stage })}
                      />
                      <WorkflowArtifacts key={`artifacts:${history.projectGroupId}:${selectedRun.id}`} groupId={history.projectGroupId} run={selectedRun} revision={history.revision} roots={projectGroup?.roots ?? []} onHistory={publishHistory} />

                    </article>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      {unavailableHistories.length > 0 ? (
        <section className="workflow-unavailable" aria-label={t("panel.workflow.unavailableHistory")}>
          <h3>{t("panel.workflow.unavailableHistory")}</h3>
          {unavailableHistories.map((item) => (
            <div key={item.projectGroupId}>
              <strong>{item.projectName || item.projectGroupId}</strong>
              {item.error ? <p className="workflow-error">{item.error}</p> : null}
              <div className="workflow-history">
                {item.runs.map((run) => (
                  <Button
                    key={run.id}
                    type="button"
                    variant="ghost"
                    className="workflow-run-choice"
                    aria-pressed={
                      unavailableHistory?.projectGroupId === item.projectGroupId
                      && selectedUnavailableRun?.id === run.id
                    }
                    onClick={() => void selectUnavailableRun(item.projectGroupId, run)}
                  >
                    <span>{run.title}</span>
                    <Badge>{t(`panel.workflow.outcomes.${run.outcome}`)}</Badge>
                  </Button>
                ))}
              </div>
            </div>
          ))}
          {selectedUnavailableRun ? (
            <article className="workflow-run" aria-label={selectedUnavailableRun.title}>
              <div className="workflow-run-heading">
                <h3>{selectedUnavailableRun.title}</h3>
                <Badge>{t("panel.workflow.readOnly")}</Badge>
              </div>
              <WorkflowStageList
                run={selectedUnavailableRun}
                stageLabel={stageLabel}
                statusLabel={(status) => t(`panel.workflow.stageStatus.${status}`)}
                lockedLabel={(stage) => t("panel.workflow.lockedUntil", { stage })}
              />
              <WorkflowExecutionHistory run={selectedUnavailableRun} />
              {unavailableHistory ? <WorkflowArtifacts key={`artifacts:${unavailableHistory.projectGroupId}:${selectedUnavailableRun.id}`} groupId={unavailableHistory.projectGroupId} run={selectedUnavailableRun} revision={unavailableHistory.revision} roots={[]} readOnly onHistory={publishHistory} /> : null}
            </article>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

