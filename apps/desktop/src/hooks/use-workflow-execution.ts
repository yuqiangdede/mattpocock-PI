import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowDiscoveryStatus, WorkflowProjectHistory, WorkflowRun, WorkflowStageId } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function useWorkflowExecution({
  groupId,
  run,
  revision,
  sessionId,
  onHistory,
}: {
  groupId?: string;
  run?: WorkflowRun;
  revision?: number;
  sessionId?: string;
  onHistory: (history: WorkflowProjectHistory) => void;
}) {
  const [status, setStatus] = useState<WorkflowDiscoveryStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const stage = run?.stages.find((item) => item.status !== "completed" && item.status !== "locked");
  const stageId = stage?.id ?? "discovery";
  const latest = run?.executions.findLast((execution) => execution.stageId === stageId && execution.stageRevision === stage?.revision);
  const unsettled = Boolean(run?.executions.some((execution) => execution.phase === "pending" || execution.phase === "running"));
  const boundBusy = useAppStore((state) => Boolean(latest && (state.runningSessions[latest.sessionId] || state.queuedPrompts[latest.sessionId]?.length)));
  const runBoundBusy = useAppStore((state) => Boolean(run?.stages.some((stage) => {
    const execution = run.executions.findLast((item) => item.stageId === stage.id && item.stageRevision === stage.revision);
    return execution && (state.runningSessions[execution.sessionId] || state.queuedPrompts[execution.sessionId]?.length);
  })));

  useEffect(() => {
    const current = ++generation.current;
    setStatus(null);
    setStarting(false);
    setError(null);
    if (groupId && run?.outcome === "active" && !unsettled) {
      void api.checkWorkflowStage({ projectGroupId: groupId, runId: run.id, stageId, sessionId: sessionId ?? "" }).then(
        (result) => { if (generation.current === current) setStatus(result); },
        (cause) => { if (generation.current === current) setError(cause instanceof Error ? cause.message : String(cause)); },
      );
    }
    return () => { generation.current += 1; };
  }, [groupId, run?.id, run?.outcome, run?.executions.length, unsettled, revision, sessionId, stageId, boundBusy]);

  useEffect(() => {
    if (!groupId || !unsettled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await api.readWorkflowHistory(groupId);
        if (!disposed) onHistory(result.history);
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!disposed) timer = setTimeout(() => { void poll(); }, 500);
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [groupId, latest?.id, unsettled, onHistory]);

  const start = useCallback(async () => {
    if (!groupId || !run || revision === undefined || !sessionId || !status?.ready || starting) return;
    const current = generation.current;
    setStarting(true);
    setError(null);
    try {
      const admission = await api.startWorkflowStage({ projectGroupId: groupId, runId: run.id, stageId, sessionId, expectedRevision: revision, requestId: crypto.randomUUID() });
      if (generation.current === current) onHistory(admission.history);
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === current) setStarting(false);
    }
  }, [groupId, run, revision, sessionId, status, starting, onHistory, stageId]);

  const stop = useCallback(async () => {
    if (!latest || !unsettled || starting) return;
    const current = generation.current;
    setStarting(true);
    setError(null);
    try {
      const result = await api.stopWorkflowExecution(latest.id);
      if (generation.current === current) onHistory(result.history);
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === current) setStarting(false);
    }
  }, [latest, unsettled, starting, onHistory]);

  const accept = useCallback(async () => {
    if (!groupId || !run || revision === undefined || !stage?.awaitingConfirmation || unsettled || boundBusy || starting) return;
    const current = generation.current;
    setStarting(true);
    setError(null);
    try {
      const result = await api.acceptWorkflowStage({ projectGroupId: groupId, runId: run.id, stageId, expectedRevision: revision });
      if (generation.current === current) onHistory(result.history);
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === current) setStarting(false);
    }
  }, [groupId, run, revision, stage, stageId, unsettled, boundBusy, starting, onHistory]);

  const reopen = useCallback(async (selectedStageId: WorkflowStageId, expectedRevision: number) => {
    if (!groupId || !run || unsettled || runBoundBusy || starting) return false;
    const current = generation.current;
    setStarting(true);
    setError(null);
    try {
      const result = await api.reopenWorkflowStage({ projectGroupId: groupId, runId: run.id, stageId: selectedStageId, expectedRevision, confirmed: true });
      if (generation.current !== current) return false;
      onHistory(result.history);
      return true;
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      if (generation.current === current) setStarting(false);
    }
  }, [groupId, run, unsettled, runBoundBusy, starting, onHistory]);

  return { status, starting, error, start, stop, accept, reopen, latest, unsettled, stage, stageId, boundBusy, runBoundBusy, revision };
}

