import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowArtifactEntry, WorkflowArtifactRegistration, WorkflowProjectHistory } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function useWorkflowArtifacts(groupId: string, runId: string, revision: number | undefined, onHistory: (history: WorkflowProjectHistory) => void) {
  const [entries, setEntries] = useState<WorkflowArtifactEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const sessionId = useAppStore((state) => state.activeSessionId);
  const projectPath = useAppStore((state) => state.activeProjectPath);
  const load = useCallback(async () => {
    const current = generation.current;
    try {
      const result = await api.listWorkflowArtifacts(groupId, runId);
      if (current === generation.current) setEntries(result.entries);
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [groupId, runId]);
  useEffect(() => {
    generation.current += 1;
    setEntries([]);
    setError(null);
    setBusy(false);
    void load();
    return () => { generation.current += 1; };
  }, [load, revision, sessionId, projectPath]);

  const register = useCallback(async (input: WorkflowArtifactRegistration) => {
    if (busy) return false;
    const current = generation.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.registerWorkflowArtifact(input);
      if (current !== generation.current) return false;
      onHistory(result.history);
      return true;
    } catch (cause) {
      if (current === generation.current) { setError(cause instanceof Error ? cause.message : String(cause)); void load(); }
      return false;
    } finally { if (current === generation.current) setBusy(false); }
  }, [busy, load, onHistory]);

  const open = useCallback(async (id: string) => {
    if (busy) return;
    const current = generation.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.openWorkflowArtifact(groupId, runId, id);
      if (current !== generation.current) return;
      setEntries((values) => values.map((value) => value.reference.id === id ? result.entry : value));
      if (result.path) useAppStore.getState().openFileInWorkPanel(result.path);
    } catch (cause) {
      if (current === generation.current) { setError(cause instanceof Error ? cause.message : String(cause)); void load(); }
    } finally { if (current === generation.current) setBusy(false); }
  }, [busy, groupId, runId, load]);
  return { entries, busy, error, register, open, refresh: load };
}
