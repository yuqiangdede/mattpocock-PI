import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FREE_TASK_ACTIONS, type FreeTask, type FreeTaskAction, type FreeTaskRequest } from "@pi-desktop/shared";
import { Button, Panel } from "../../components/ui";
import { Markdown } from "../../components/Markdown";
import { api } from "../../lib/api";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import { useAppStore } from "../../stores/app-store";
import { codingDraftKey, type CodingDraft, useCodingDrafts } from "./coding-drafts";
import { CodingTaskPanel } from "./CodingTaskPanel";

export function CodingWorkbench({ home, onHome, onChat }: { home: boolean; onHome: () => void; onChat: () => void }) {
  const { t } = useTranslation();
  const sessionId = useAppStore((state) => state.activeSessionId);
  const session = useAppStore((state) => state.sessions.find((item) => item.id === state.activeSessionId));
  const path = session?.projectPath ?? "";
  const running = useAppStore((state) => state.runningSessions);
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<FreeTaskAction | null>(null);
  const [panelDraftKey, setPanelDraftKey] = useState("");
  const [panelEpoch, setPanelEpoch] = useState(0);
  const panelIdentity = useRef(0);
  const [tasks, setTasks] = useState<FreeTask[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [unavailableHistory, setUnavailableHistory] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [waiting, setWaiting] = useState<FreeTaskRequest | null>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const close = useCallback(() => { if (panelIdentity.current === panelEpoch) setAction(null); }, [panelEpoch]);
  const openAction = (next: FreeTaskAction) => { const epoch = ++panelIdentity.current; setPanelEpoch(epoch); setPanelDraftKey(codingDraftKey(path, sessionId ?? "", next)); setAction(next); };
  useEffect(() => {
    if (!action) return;
    const key = codingDraftKey(path, sessionId ?? "", action);
    if (key === panelDraftKey) return;
    const draft = useCodingDrafts.getState().drafts[panelDraftKey];
    if (draft) useCodingDrafts.getState().update(key, draft);
    setPanelDraftKey(key);
  }, [path, sessionId, action, panelDraftKey]);
  const refresh = useCallback(async () => {
    const stamp = generation.current;
    if (!path) { setTasks([]); return; }
    try {
      const [result, readiness] = await Promise.all([api.listFreeTasks(path), sessionId ? api.checkFreeTask(sessionId) : Promise.resolve({ busy: false })]);
      if (generation.current === stamp) { setTasks(result.tasks); setUnavailableHistory(result.unavailableCount ?? 0); setSessionBusy(readiness.busy); setWaiting((current) => current ?? result.tasks.find((task) => task.phase === "waiting") ?? null); }
    }
    catch (cause) { if (generation.current === stamp) setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [path, sessionId]);
  useEffect(() => {
    generation.current += 1;
    void refresh();
    let disposed = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!disposed) timer = setTimeout(() => void poll(), 1500); };
    timer = setTimeout(() => void poll(), 1500);
    return () => { disposed = true; clearTimeout(timer); generation.current += 1; };
  }, [refresh]);
  const dispatch = useCallback(async (request: FreeTaskRequest) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const task = await api.startFreeTask({ requestId: request.requestId, sessionId: request.sessionId, action: request.action,
        description: request.description, references: request.references, ...(request.wait ? { wait: true } : {}) });
      if (task.phase === "waiting") setWaiting(request);
      await useAppStore.getState().refreshSessions();
      if (task.phase !== "waiting" && useAppStore.getState().activeSessionId === request.sessionId) onChat();
      await refresh();
    } finally { busyRef.current = false; }
  }, [onChat, refresh]);
  useEffect(() => {
    if (!waiting) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        if (!busyRef.current && !(await api.checkFreeTask(waiting.sessionId)).busy && !disposed) {
          setWaiting(null);
          await dispatch(waiting);
          return;
        }
      } catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); }
      if (!disposed) timer = setTimeout(() => void check(), 750);
    };
    void check();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [waiting, dispatch]);
  const start = async (draft: CodingDraft, wait: boolean) => {
    if (!action || !path) return;
    const requestedAction = action;
    let target = sessionId;
    if (draft.destination === "new" || !target) {
      const created = await api.createSession({ projectPath: path, title: t(`coding.${requestedAction}`),
        providerId: session?.providerId, modelId: session?.modelId, thinkingLevel: session?.thinkingLevel });
      target = created.session.id;
      await useAppStore.getState().refreshSessions();
      await useAppStore.getState().selectSession(target);
    }
    const request: FreeTaskRequest = { requestId: crypto.randomUUID(), sessionId: target,
      action: requestedAction, description: draft.description.trim(), references: draft.references.split("\n").map((item) => item.trim()).filter(Boolean) };
    if (wait) request.wait = true;
    await dispatch(request);
  };
  const handoff = (next: FreeTaskAction, task: FreeTask) => {
    const key = codingDraftKey(path, sessionId ?? "", next);
    useCodingDrafts.getState().update(key, { description: task.description,
      references: task.action === "initialize" && next === "initialize" ? `init:${task.requestId}` : [...task.references.filter((reference) => !reference.startsWith("task:")), `task:${task.id}`].join("\n"), destination: "current" });
    openAction(next);
  };
  const perform = async (work: () => Promise<unknown>) => {
    try { await work(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section className={`coding-workbench${home ? " is-home" : ""}`} aria-label={t("coding.title")}>
    <div className="coding-toolbar">
      <strong>{t("coding.title")}</strong>
      {!home && <Button onClick={onHome}>{t("coding.back")}</Button>}
      <Button onClick={() => setExpanded((value) => !value)}>{t("coding.tools")}</Button>
      <Button onClick={() => useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("workflow"))}>{t("coding.formal")}</Button>
    </div>
    {(home || expanded) && <>
      <p className="coding-project">{path || t("coding.chooseProject")}</p>
      {!path && <Button onClick={() => void useAppStore.getState().openProject()}>{t("coding.chooseProject")}</Button>}
      {[FREE_TASK_ACTIONS.slice(0, 4), FREE_TASK_ACTIONS.slice(4)].map((group, index) => <div key={index}>
        <h3>{t(index === 0 ? "coding.journey" : "coding.common")}</h3>
        <div className="coding-grid">{group.map((id) => <Panel key={id} className="coding-card">
          <strong>{t(`coding.${id}`)}</strong><p>{t(`coding.${id}Hint`)}</p>
          <Button onClick={() => openAction(id)} aria-label={`${t("coding.start")} ${t(`coding.${id}`)}`}>{t("coding.start")}</Button>
        </Panel>)}</div>
      </div>)}
    </>}
    {waiting && <p role="status">{t("coding.waiting")}: {waiting.description} <Button onClick={() => void perform(async () => { const task = tasks.find((item) => item.requestId === waiting.requestId); if (task) await api.stopFreeTask(task.id); setWaiting(null); })}>{t("coding.withdraw")}</Button></p>}
    {error && <p role="alert">{error}</p>}
    {unavailableHistory > 0 && <p role="status">{t("coding.unavailableHistory", { count: unavailableHistory })}</p>}
    {(home || expanded ? tasks.slice(0, showHistory ? tasks.length : 6) : tasks.filter((task) => ["waiting", "pending", "running"].includes(task.phase))).map((task) => <Panel key={task.id} className="coding-result">
      <strong>{t(`coding.${task.action}`)} · {t(`coding.${task.phase}`)}</strong><p>{task.description}</p>
      {task.error && <p role="alert">{task.error}</p>}
      {task.result && <details><summary>{t("coding.result")}</summary><Markdown source={task.result} renderDiagrams={false} /></details>}
      <p>{t("coding.verification")}</p>
      <div className="coding-actions">
        <Button onClick={() => void perform(async () => { await useAppStore.getState().selectSession(task.sessionId); onChat(); })}>{t("coding.openConversation")}</Button>
        {task.phase === "running" || task.phase === "pending" || task.phase === "waiting" ? <Button onClick={() => void perform(() => api.stopFreeTask(task.id))}>{t("coding.stop")}</Button> : <>
          <Button onClick={() => handoff(task.action, task)}>{t(task.phase === "completed" ? "coding.continue" : "coding.retry")}</Button>
          {(task.action === "discovery" ? ["spec", "implement"] : task.action === "spec" ? ["tickets", "implement"] : ["review", "diagnose", "retro"]).map((next) => <Button key={next} onClick={() => handoff(next as FreeTaskAction, task)}>{t(`coding.${next}`)}</Button>)}
        </>}
      </div>
    </Panel>)}
    {(home || expanded) && tasks.length > 6 && !showHistory && <Button onClick={() => setShowHistory(true)}>{t("coding.history")}</Button>}
    {action && <CodingTaskPanel key={panelDraftKey} action={action} draftKey={panelDraftKey} projectPath={path} busy={sessionBusy || Boolean(sessionId && running[sessionId])} onClose={close} onStart={start} />}
  </section>;
}
