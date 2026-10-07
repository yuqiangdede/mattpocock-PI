import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineeringActivity, NavigatorAnalysis as Analysis, NavigatorAnalysisSnapshot, NavigatorResult, NavigatorSuggestion } from "@pi-desktop/shared";
import { Button, Checkbox } from "../../components/ui";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { createNavigatorAnalysisController } from "./navigator-analysis-controller";
import { loadNavigatorSkillAvailability } from "./navigator-skill-availability";

export type NavigatorSuggestionSelection = { activity: EngineeringActivity; analysis: Analysis; suggestion: NavigatorSuggestion };
export function NavigatorAnalysis({ activity, busy, onPrepare }: {
  activity: EngineeringActivity; busy: boolean;
  onPrepare?: (selection: NavigatorSuggestionSelection) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const projectPath = useAppStore(s => s.workspace?.path);
  const [available, setAvailable] = useState<Set<string> | null>(null);
  const [state, setState] = useState<{ snapshot: NavigatorAnalysisSnapshot; pending: boolean; error: string | null }>({ snapshot: { analyses: [] }, pending: false, error: null });
  const [results, setResults] = useState<NavigatorResult[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceVersion, setEvidenceVersion] = useState<number | null>(null);
  const generation = useRef(0);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState(false);
  const preparationPending = useRef(false);
  useEffect(() => { setPreparing(false); setPrepareError(false); preparationPending.current = false; }, [activity.sessionId, activity.id, activity.version, projectPath]);
  const prepare = async (analysis: Analysis, suggestion: NavigatorSuggestion) => {
    if (!onPrepare || preparationPending.current) return;
    const token = generation.current;
    preparationPending.current = true; setPreparing(true); setPrepareError(false);
    try {
      const success = await onPrepare({ activity, analysis, suggestion });
      if (token === generation.current) setPrepareError(!success);
    } catch { if (token === generation.current) setPrepareError(true); }
    finally { if (token === generation.current) { preparationPending.current = false; setPreparing(false); } }
  };
  const controller = useMemo(() => createNavigatorAnalysisController(api, setState), []);
  useEffect(() => {
    void controller.select({ sessionId: activity.sessionId, activityId: activity.id });
    return () => controller.dispose();
  }, [controller, activity.sessionId, activity.id, projectPath]);
  useEffect(() => {
    let current = true;
    setAvailable(null);
    void loadNavigatorSkillAvailability(api.composerCommands).then(skills => {
      if (!current) return;
      setAvailable(skills);
    }).catch(() => { if (current) setAvailable(null); });
    return () => { current = false; };
  }, [activity.sessionId, projectPath, state.snapshot]);
  useEffect(() => {
    const token = ++generation.current;
    setEvidenceVersion(null); setEvidenceError(null);
    void api.listNavigatorResults({ sessionId: activity.sessionId, activityId: activity.id }).then(snapshot => {
      if (token !== generation.current) return;
      setResults(snapshot.results); setEvidenceVersion(snapshot.version);
      setSelectedFiles(snapshot.results.filter(item => item.kind === "file").map(item => item.id));
    }).catch(cause => { if (token === generation.current) setEvidenceError(String(cause)); });
    return () => { generation.current++; };
  }, [activity.sessionId, activity.id, activity.version, projectPath]);
  const running = state.pending || state.snapshot.analyses.some(item => item.status === "running");
  const previous = state.snapshot.analyses.find(item => item.status === "completed");
  const selected = results.filter(item => item.kind !== "file" || selectedFiles.includes(item.id)).map(item => item.id);
  return <section aria-label={t("navigator.analysis.title")}>
    <h4>{t("navigator.analysis.title")}</h4>
    <p>{t("navigator.analysis.method")}</p>
    <details><summary>{t("navigator.analysis.basis")}</summary>
      <p>{t("navigator.analysis.requestBasis", { skills: activity.requests.flatMap(item => item.requestedSkills).join(", ") })}</p>
      <p>{t("navigator.analysis.scope")}</p>
      <ul>{results.map(result => <li key={result.id}>{result.kind === "file" ?
        <Checkbox label={`${result.label} (${result.path ?? ""})`} checked={selectedFiles.includes(result.id)} disabled={running} onChange={event => setSelectedFiles(files => event.target.checked ? [...files, result.id] : files.filter(id => id !== result.id))} /> :
        <span>{result.label || t("navigator.results.reply")}</span>}
        <p>{t(`navigator.results.verification.${result.verification}`)}</p>
      </li>)}</ul>
      {!results.length && <p>{t("navigator.results.unknown")}</p>}
    </details>
    {activity.endedAt === null && <p>{t("navigator.analysis.endRequired")}</p>}
    {busy && <p>{t("navigator.analysis.idleRequired")}</p>}
    {evidenceError && <p role="alert">{t("navigator.analysis.failed", { detail: evidenceError })}</p>}
    <Button disabled={running || busy || activity.endedAt === null || evidenceVersion !== activity.version} onClick={() => void controller.request(activity.version, selected)}>{t(state.error || state.snapshot.analyses.some(item => item.status === "failed" || item.status === "cancelled" || item.status === "interrupted") ? "navigator.analysis.retry" : "navigator.analysis.request")}</Button>
    {running && <><p role="status">{t("navigator.analysis.running")}</p><Button onClick={() => void controller.cancel()}>{t("navigator.analysis.cancel")}</Button></>}
    {state.error && <p role="alert">{t("navigator.analysis.failed", { detail: state.error })}</p>}
    {prepareError && <p role="alert">{t("navigator.draft.failed")}</p>}
    {previous && <div>
      <time dateTime={new Date(previous.createdAt).toISOString()}>{new Date(previous.createdAt).toLocaleString()}</time>
      {(previous.stale || previous.activityVersion !== activity.version) && <p role="status">{t("navigator.analysis.stale")}</p>}
      {!previous.suggestions.length && <p>{t("navigator.analysis.noSuggestions")}</p>}
      <ul>{previous.suggestions.map(suggestion => <li key={suggestion.skillId}>
        <strong>{suggestion.skillId}</strong><p>{suggestion.reason}</p>
        <ul>{suggestion.basis.map((basis, index) => <li key={index}>{basis}</li>)}</ul>
        {(!available || !available.has(suggestion.skillId)) && <p role="status">{t(available ? "navigator.analysis.skillUnavailable" : "navigator.analysis.skillUnknown")}</p>}
        {onPrepare && <Button disabled={preparing || !available?.has(suggestion.skillId)} onClick={() => void prepare(previous, suggestion)}>{t("navigator.analysis.prepare")}</Button>}
        {(!available?.has(suggestion.skillId) || prepareError) && <Button onClick={() => { const store = useAppStore.getState(); store.setSettingsTab("agent"); store.setPage("settings"); }}>{t("coding.configureSkills")}</Button>}
      </li>)}</ul>
    </div>}
    <details><summary>{t("navigator.analysis.history")}</summary>{state.snapshot.analyses.map(analysis => <article key={analysis.id}>
      <p>{t(`navigator.analysis.status.${analysis.status}`)} · <time dateTime={new Date(analysis.createdAt).toISOString()}>{new Date(analysis.createdAt).toLocaleString()}</time></p>
      {analysis.diagnostic && <p role="alert">{analysis.diagnostic}</p>}
      <pre>{analysis.rawText}</pre>
    </article>)}</details>
  </section>;
}
