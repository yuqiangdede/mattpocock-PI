import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useBlockingOverlay } from "../../lib/blocking-overlay";
import { useAppStore } from "../../stores/app-store";
import { Button, Textarea, Input, portalOverlay } from "../../components/ui";
import {
  applyGrillReply, decideGrillQuestion, grillPrompt, loadGrill, newGrill,
  parseGrillReply, saveGrill, summaries, canAutoRetryGrill, setGrillCustomAnswer, type GrillOperation, type GrillQuestion, type GrillState,
} from "./grill-workspace-model";
import "./grill-workspace.css";

type Language = "zh" | "en";
const EMPTY_MESSAGES: Array<{ role?: string; content?: string; createdAt?: string }> = [];
const copy = {
  zh: {
    title: "可视化需求讨论", close: "关闭", topic: "讨论主题", topicHint: "例如：预警中心三色区域配置及报警关联逻辑",
    begin: "开始讨论", next: "下一轮问题", finish: "完成访谈", finished: "已完成", restart: "重新开始",
    empty: "尚无问题。请输入主题，Agent 将结合当前会话和代码提出第一轮问题。",
    waiting: "已提交，等待 Agent 回答…", invalid: "Agent 已回复，但没有返回有效的结构化结果。可重试本次操作；原始回复仍保存在会话中。",
    noReply: "尚未收到 Agent 的回复。关闭此窗口不会丢失请求，可稍后打开恢复。",
    accepted: "已接收，等待处理", retry: "重试", retryHint: "重试可能产生第二条 Agent 消息，请检查原会话是否仍在运行。",
    ask: "针对当前问题进行讨论", placeholder: "为什么推荐这个方案？有哪些取舍？",
    send: "发送追问", recommend: "Agent 推荐", reason: "推荐理由", custom: "其他想法（请在右侧讨论）",
    confirmed: "已确认", deferred: "暂缓", open: "待确认", confirm: "确认本题", defer: "暂缓本题", reopen: "重新讨论",
    notChosen: "请选择至少一个答案。", noQuestion: "本轮没有新的问题。可以完成访谈，或继续追问已有问题。",
    noSession: "请切回本次讨论关联的会话后再发送。", storeError: "本地状态保存失败；关闭窗口可能丢失未发送的讨论草稿。",
    pendingWarning: "已有请求正在等待 Agent；为避免重复提交，暂时不能发起下一条。",
    progress: "已确认", discussion: "独立讨论", recorded: "此讨论仅属于当前问题，不会自动修改您的选择。",
    finishNote: "最终结论", content: "讨论内容不能为空。", failure: "Agent 未接收请求，请检查会话状态后重试。",
  },
  en: {
    title: "Visual requirements interview", close: "Close", topic: "Discussion topic", topicHint: "e.g. Alert zone configuration and device alarm routing",
    begin: "Start interview", next: "Next round", finish: "Finish interview", finished: "Completed", restart: "Start again",
    empty: "No questions yet. Enter a topic and the Agent will inspect conversation and project context.",
    waiting: "Submitted; waiting for the Agent…", invalid: "The Agent replied without a valid structured result. You can retry; its response remains in the session.",
    noReply: "The Agent has not replied yet. This request is kept when you close this panel.",
    accepted: "Accepted, waiting", retry: "Retry", retryHint: "Retry can create a second Agent response; check the original conversation first.",
    ask: "Discuss this question", placeholder: "Why is this recommended? What are the trade-offs?",
    send: "Send follow-up", recommend: "Agent recommends", reason: "Rationale", custom: "Another idea (discuss in the right panel)",
    confirmed: "Confirmed", deferred: "Deferred", open: "Open", confirm: "Confirm answer", defer: "Defer", reopen: "Reopen",
    notChosen: "Choose at least one answer.", noQuestion: "No further questions this round. Finish or discuss existing questions.",
    noSession: "Switch back to this interview's conversation before sending.", storeError: "Unable to persist state locally. Closing the panel may lose a draft.",
    pendingWarning: "One request is still pending. New sends are held to prevent duplicates.",
    progress: "Confirmed", discussion: "Question thread", recorded: "This thread belongs to this question; discussion does not change a confirmed choice.",
    finishNote: "Outcome", content: "Message must not be empty.", failure: "The Agent did not accept this request. Check session status and retry.",
  },
};

function latestReply(messages: Array<{ role?: string; content?: string; createdAt?: string }>, pending: GrillOperation) {
  const sorted = messages.filter(m => m.role === "assistant" && typeof m.content === "string").slice(-35).reverse();
  for (const message of sorted) {
    if (message.createdAt && Date.parse(message.createdAt) + 5000 < Date.parse(pending.submittedAt)) continue;
    const reply = parseGrillReply(message.content ?? "", pending);
    if (reply) return reply;
  }
  return null;
}

export function GrillWorkspaceContent({ sessionId, onClose, onNext }: { sessionId: string; onClose: () => void; onNext?: (context: string) => void }) {
  useBlockingOverlay();
  const { i18n } = useTranslation();
  const { t: translate } = useTranslation();
  const language: Language = (i18n.resolvedLanguage ?? i18n.language).startsWith("zh") ? "zh" : "en";
  const t = copy[language];
  const activeSessionId = useAppStore(s => s.activeSessionId);
  const isRunning = useAppStore(s => s.runningSessions[sessionId] ?? false);
  const turnResult = useAppStore(s => s.latestTurnResults[sessionId]);
  const messages = useAppStore(s => s.activeSessionId === sessionId ? s.messages : s.retainedTranscripts[sessionId] ?? EMPTY_MESSAGES);
  const [state, setState] = useState<GrillState | null>(() => loadGrill(sessionId));
  const [topic, setTopic] = useState("");
  const [threadInput, setThreadInput] = useState("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [tick, setTick] = useState(0);
  const [persistError, setPersistError] = useState(false);
  const inflight = useRef(false);
  const readingHost = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const canSend = activeSessionId === sessionId;
  const current = state?.questions.find(q => q.id === state.selectedId) ?? null;

  useEffect(() => {
    if (state) setPersistError(!saveGrill(state));
  }, [state]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    frame.current?.focus();
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [onClose]);
  useEffect(() => {
    if (!state?.pending) return;
    const timer = window.setInterval(() => setTick(n => n + 1), 1500);
    return () => window.clearInterval(timer);
  }, [state?.pending?.id]);
  useEffect(() => {
    if (!state?.pending) { setInvalid(false); return; }
    const operation = state.pending;
    const seen = latestReply(messages, operation);
    if (seen) {
      setState(s => s && s.pending?.id === operation.id ? applyGrillReply(s, seen) : s);
      setError(""); setInvalid(false);
      return;
    }
    if (readingHost.current) return;
    // Poll the Host transcript, not an orphaned browser subprocess.
    // A request can survive closing and reopening this workspace.
    readingHost.current = true;
    let active = true;
    void api.getSession(sessionId, { messageLimit: 120, contentLimit: 65_536 })
      .then(result => {
        if (!active) return;
        const rows = result.session?.messages ?? [];
        const reply = latestReply(rows, operation);
        if (reply) {
          setState(s => s && s.pending?.id === operation.id ? applyGrillReply(s, reply) : s);
          setError(""); setInvalid(false);
          return;
        }
        // Only a completed answer to our own user turn can be called invalid.
        // An unrelated assistant message must not fail a queued action.
        let index = -1;
        for (let i = rows.length - 1; i >= 0; i--) {
          const message = rows[i];
          if (message.role === "user" && message.content.includes(operation.id)) {
            index = i;
            break;
          }
        }
        if (!isRunning && index >= 0 &&
          rows.slice(index + 1).some(m => m.role === "assistant" && m.status === "complete")) {
          setInvalid(true);
        }
      }).catch(err => { if (active) setError(String(err)); })
      .finally(() => { readingHost.current = false; });
    return () => { active = false; };
  }, [tick, state?.pending?.id, messages, isRunning, sessionId]);

  const submitOperation = async (basis: GrillState, kind: GrillOperation["kind"], text = "", questionId?: string, retryCount = 0) => {
    if (inflight.current || basis.pending || !canSend) { setError(!canSend ? t.noSession : t.pendingWarning); return; }
    const operation: GrillOperation = { id: crypto.randomUUID(), kind, questionId, text, submittedAt: new Date().toISOString(), retryCount };
    const next: GrillState = { ...basis, pending: operation };
    if (kind === "discuss" && questionId) next.questions = basis.questions.map(q => q.id === questionId
      ? { ...q, thread: [...q.thread, { id: operation.id, who: "user" as const, text, at: operation.submittedAt }].slice(-100) }
      : q);
    setState(next); setError(""); setInvalid(false);
    // Save before submission: reopening the workspace can reconcile late results.
    if (!saveGrill(next)) { setError(t.storeError); setState(basis); return; }
    inflight.current = true;
    try {
      const accepted = await useAppStore.getState().sendPrompt(grillPrompt(next, operation), undefined, sessionId);
      if (!accepted) {
        setState(s => s?.pending?.id === operation.id ? basis : s);
        setError(t.failure);
        return;
      }
      if (kind === "discuss") setThreadInput("");
    } catch (cause) {
      setState(s => s?.pending?.id === operation.id ? basis : s);
      setError(String(cause));
    } finally {
      inflight.current = false;
    }
  };
  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!topic.trim()) return;
    void submitOperation(newGrill(sessionId, topic), "round");
  };
  const mutate = (fn: (s: GrillState) => GrillState) => {
    setState(previous => previous && !previous.pending ? fn(previous) : previous);
    setError("");
  };
  const answer = (q: GrillQuestion, key: string) => {
    const next = q.multi
      ? q.selected.includes(key) ? q.selected.filter(k => k !== key) : [...q.selected, key]
      : [key];
    mutate(s => decideGrillQuestion(s, q.id, "select", next));
  };
  const discuss = (event: FormEvent) => {
    event.preventDefault();
    if (!state || !current || !threadInput.trim()) { setError(t.content); return; }
    void submitOperation(state, "discuss", threadInput.trim().slice(0, 8000), current.id);
  };
  const retry = () => {
    if (!state?.pending) return;
    // Each attempt has a new correlation ID; keep the bounded budget across reopen.
    const op = state.pending;
    const base = { ...state, pending: null };
    if (op.kind === "discuss") base.questions = state.questions.map(q =>
      q.id === op.questionId ? { ...q, thread: q.thread.filter(m => m.id !== op.id) } : q);
    setInvalid(false);
    void submitOperation(base, op.kind, op.text, op.questionId, (op.retryCount ?? 0) + 1);
  };
  useEffect(() => {
    if (invalid && state?.pending && canSend && !error && !inflight.current && canAutoRetryGrill(state.pending, turnResult, isRunning)) retry();
  }, [invalid, state?.pending?.id, turnResult, isRunning, canSend, error]);
  const allSettled = state?.questions.every(q => q.status !== "open") ?? false;
  const confirmed = state?.questions.filter(q => q.status === "confirmed").length ?? 0;
  return <div className="overlay grill-overlay">
    <div ref={frame} tabIndex={-1} className="dialog grill-dialog" role="dialog" aria-modal="true" aria-labelledby="grill-dialog-title">
      <header className="grill-header">
        <div>
          <h2 id="grill-dialog-title">{t.title}</h2>
          <p>{state ? state.topic : t.empty}</p>
        </div>
        <Button variant="ghost" onClick={onClose}>{t.close}</Button>
      </header>
      {!state ? <form className="grill-start" onSubmit={start}>
        <label htmlFor="grill-topic">{t.topic}</label>
        <Input id="grill-topic" value={topic} maxLength={200} placeholder={t.topicHint} onChange={e => setTopic(e.target.value)} />
        <Button type="submit" disabled={!canSend || !topic.trim()}>{t.begin}</Button>
      </form> : <>
        <div className="grill-meta">
          <span>{t.progress} {confirmed}/{state.questions.length} · {state.round}</span>
          <div className="grill-meta-actions">
            <Button variant="ghost" disabled={Boolean(state.pending) || !allSettled || state.finished || state.questions.length >= 100 || !canSend} onClick={() => void submitOperation(state, "round")}>{t.next}</Button>
            <Button variant="secondary" disabled={Boolean(state.pending) || state.finished || !canSend} onClick={() => void submitOperation(state, "finish")}>{state.finished ? t.finished : t.finish}</Button>
          </div>
        </div>
        <div className="grill-columns">
          <section className="grill-questions" aria-label={t.title}>
            <nav className="grill-question-nav" aria-label={t.progress}>
              {state.questions.map(q => <Button key={q.id} variant={q.id === current?.id ? "secondary" : "ghost"} onClick={() => { setState(s => s ? { ...s, selectedId: q.id } : s); setThreadInput(""); }} title={q.title}>
                {q.id} · {q.title} · {t[q.status]}
              </Button>)}
            </nav>
            {current ? <article className="grill-question-detail">
              <h3>{current.title}</h3><p>{current.body}</p>
              <div className="grill-options" role={current.multi ? "group" : "radiogroup"}>
                {current.options.map(opt => <Button key={opt.key} variant={current.selected.includes(opt.key) ? "secondary" : "ghost"}
                  disabled={Boolean(state.pending) || state.finished || current.status !== "open"}
                  role={current.multi ? "checkbox" : "radio"}
                  aria-checked={current.selected.includes(opt.key)}
                  onClick={() => answer(current, opt.key)}>{opt.key}. {opt.label}</Button>)}
                <Button variant={current.selected.includes("OTHER") ? "secondary" : "ghost"}
                  disabled={Boolean(state.pending) || state.finished || current.status !== "open"}
                  role={current.multi ? "checkbox" : "radio"} aria-checked={current.selected.includes("OTHER")}
                  onClick={() => answer(current, "OTHER")}>{translate("codingActions.visualOther")}</Button>
              </div>
              {current.selected.includes("OTHER") && <Textarea aria-label={translate("codingActions.visualOtherAnswer")}
                placeholder={translate("codingActions.visualOtherAnswer")} value={current.customAnswer ?? ""} maxLength={3000}
                disabled={Boolean(state.pending) || state.finished || current.status !== "open"}
                onChange={event => mutate(s => setGrillCustomAnswer(s, current.id, event.target.value))} />}
              <div className="grill-recommend">
                <strong>{t.recommend}: {current.recommended.join(", ")}</strong>
                <p>{t.reason}: {current.why}</p>
              </div>
              <div className="grill-answer-actions">
                {current.status === "open" ? <>
                  <Button disabled={!current.selected.length || Boolean(state.pending) || (current.selected.includes("OTHER") && !current.customAnswer?.trim())} onClick={() => mutate(s => decideGrillQuestion(s, current.id, "confirm"))}>{t.confirm}</Button>
                  <Button variant="ghost" disabled={Boolean(state.pending)} onClick={() => mutate(s => decideGrillQuestion(s, current.id, "defer"))}>{t.defer}</Button>
                </> : <Button variant="secondary" disabled={Boolean(state.pending) || state.finished} onClick={() => mutate(s => decideGrillQuestion(s, current.id, "reopen"))}>{t.reopen}</Button>}
              </div>
            </article> : <p className="grill-empty">{t.noQuestion}</p>}
          </section>
          <section className="grill-thread" aria-label={t.discussion}>
            <h3>{t.discussion}{current ? ` · ${current.id}` : ""}</h3>
            <div className="grill-thread-log" role="log" aria-live="polite">
              {current?.thread.map(m => <div className={`grill-thread-entry ${m.who}`} key={m.id + m.who}>
                <span>{m.who === "user" ? "You" : "Agent"}</span>
                <p>{m.text}</p>
              </div>)}
            </div>
            <p className="grill-thread-note">{t.recorded}</p>
            <form onSubmit={discuss}>
              <Textarea rows={3} value={threadInput} maxLength={8000} placeholder={t.placeholder} disabled={!current || state.finished}
                onChange={e => setThreadInput(e.target.value)} aria-label={t.ask} />
              <Button type="submit" disabled={!current || !canSend || !threadInput.trim() || Boolean(state.pending) || state.finished}>{t.send}</Button>
            </form>
          </section>
        </div>
        {state.noMoreQuestions && !state.finished && !state.pending && <p className="grill-result" role="status">{translate("codingActions.visualNoMoreQuestions")}</p>}
        {state.finished && <p className="grill-result"><strong>{t.finishNote}：</strong>{state.finishNote}</p>}
        {state.finished && onNext && <div className="coding-next-steps">
          <span>{translate("codingActions.recommendedNext")}</span>
          <Button disabled={!canSend} onClick={() => onNext([state.topic, state.finishNote, summaries(state)].join("\n\n"))}>{translate("codingActions.defaults.create-spec")}</Button>
        </div>}
        {state.pending && <div className="grill-pending" role="status">
          <span>{invalid && (state.pending.retryCount ?? 0) >= 3 ? translate("codingActions.visualRetryExhausted") : invalid ? t.invalid : isRunning ? t.waiting : t.noReply}{(state.pending.retryCount ?? 0) > 0 && ` (${Math.min(state.pending.retryCount ?? 0, 3)}/3)`}</span>
          {invalid && <Button variant="secondary" onClick={retry} disabled={!canSend}>{t.retry}</Button>}
        </div>}
      </>}
      {(error || persistError || !canSend) && <p className="grill-error" role="alert">{error || (persistError ? t.storeError : t.noSession)}</p>}
    </div>
  </div>;
}
export function GrillWorkspace({ sessionId, onClose, onNext }: { sessionId: string; onClose: () => void; onNext?: (context: string) => void }) {
  return portalOverlay(<GrillWorkspaceContent sessionId={sessionId} onClose={onClose} onNext={onNext} />);
}
