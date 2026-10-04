import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectGroupRecord, RequirementsHistory, RequirementsPreview } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { normalizeProjectPath } from "../../lib/sidebar-session-groups";

export function useRequirementsConfirmation(projectPath: string) {
  const [group, setGroup] = useState<ProjectGroupRecord | null>(null);
  const [history, setHistory] = useState<RequirementsHistory | null>(null);
  const [root, setRoot] = useState("");
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<RequirementsPreview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    const stamp = ++generation.current;
    inFlight.current = true;
    setBusy(true);
    setGroup(null); setHistory(null); setPreview(null); setError(null);
    void (async () => {
      try {
        const { groups } = await api.listProjectGroups();
        const owner = groups.find(item => item.roots.some(itemRoot => normalizeProjectPath(itemRoot.path) === normalizeProjectPath(projectPath)));
        if (!owner) throw new Error("REQUIREMENTS_PROJECT_UNAVAILABLE");
        const records = await api.readRequirementsHistory(owner.id);
        if (generation.current !== stamp) return;
        setGroup(owner); setHistory(records);
        const latest = [...records.confirmations].reverse().find(record => owner.roots.some(item => item.path === record.workspaceRoot));
        setRoot(latest?.workspaceRoot ?? owner.roots[0].path);
        setPath(latest?.relativePath ?? "");
        if (latest) {
          const result = await api.previewRequirements({ projectGroupId: owner.id, workspaceRoot: latest.workspaceRoot, relativePath: latest.relativePath });
          if (generation.current === stamp) setPreview(result);
        }
      } catch (cause) {
        if (generation.current === stamp) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (generation.current === stamp) { inFlight.current = false; setBusy(false); }
      }
    })();
    return () => { generation.current += 1; };
  }, [projectPath]);

  const select = (nextRoot: string, nextPath: string) => {
    if (inFlight.current) return;
    generation.current += 1;
    setRoot(nextRoot); setPath(nextPath); setPreview(null); setError(null);
  };

  const refresh = useCallback(async () => {
    if (!group || inFlight.current || !path.trim()) return;
    const stamp = ++generation.current;
    inFlight.current = true; setBusy(true); setPreview(null); setError(null);
    try {
      const result = await api.previewRequirements({ projectGroupId: group.id, workspaceRoot: root, relativePath: path.trim() });
      const records = await api.readRequirementsHistory(group.id);
      if (generation.current !== stamp) return;
      // A different confirmation may have occurred while the preview was loading.
      if (records.revision !== result.revision) throw new Error("REQUIREMENTS_CONFLICT");
      setPreview(result); setHistory(records);
    } catch (cause) {
      if (generation.current === stamp) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === stamp) { inFlight.current = false; setBusy(false); }
    }
  }, [group, path, root]);

  const confirm = useCallback(async () => {
    if (!preview || inFlight.current || preview.status === "confirmed") return;
    const stamp = ++generation.current;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const records = await api.confirmRequirements({ ...preview.target, expectedRevision: preview.revision, contentHash: preview.contentHash });
      if (generation.current !== stamp) return;
      setHistory(records);
      const result = await api.previewRequirements(preview.target);
      if (generation.current === stamp) setPreview(result);
    } catch (cause) {
      if (generation.current === stamp) {
        setPreview(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (generation.current === stamp) { inFlight.current = false; setBusy(false); }
    }
  }, [preview]);

  return { group, history, root, path, preview, busy, error, select, refresh, confirm };
}
