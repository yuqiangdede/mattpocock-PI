import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useBlockingOverlay } from "../../lib/blocking-overlay";
import { Button, Field, Textarea, portalOverlay } from "../../components/ui";
import { inspectTaskGraph, type TaskGraphInspection } from "./task-graph-model";
import { skillGateMetadata } from "./skill-gates";
import "./task-graph.css";


/** Local inspection only. Execution and permissions stay with the user's CLI/Hooks. */
export function TaskGraphViewerContent({ onClose, returnFocus }: { onClose: () => void; returnFocus?: HTMLElement | null }) {
  useBlockingOverlay();
  const { t } = useTranslation();
  const example = JSON.stringify({ tasks: [
    { id: "spec", title: t("taskGraph.exampleSpec"), status: "done" },
    { id: "implementation", title: t("taskGraph.exampleImplementation"), status: "pending", blockedBy: ["spec"] },
  ] }, null, 2);
  const [draft, setDraft] = useState("");
  const [inspection, setInspection] = useState<TaskGraphInspection | null>(null);
  const input = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const gate = skillGateMetadata("implement-spec");
  useEffect(() => {
    const previous = returnFocus ?? document.activeElement;
    input.current?.querySelector("textarea")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = input.current?.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled])");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  const inspect = (event: FormEvent) => {
    event.preventDefault();
    setInspection(inspectTaskGraph(draft));
  };
  return <div ref={input} className="dialog task-graph-dialog" role="dialog" aria-modal="true" aria-labelledby="task-graph-title" aria-describedby="task-graph-purpose">
    <div className="task-graph-heading">
      <h2 id="task-graph-title">{t("taskGraph.title")}</h2>
      <Button variant="ghost" onClick={onClose}>{t("taskGraph.close")}</Button>
    </div>
    <p id="task-graph-purpose">{t("taskGraph.purpose")}</p>
    <p className="text-text-muted">{t("skillGates.description")}</p>
    <ul aria-label={t("skillGates.title")}>{gate?.gates.map(item => <li key={item}>{t(`skillGates.${item}`)}</li>)}</ul>
    <form onSubmit={inspect}>
      <Field label={t("taskGraph.input")} hint={t("taskGraph.schema")}>
        <Textarea value={draft} rows={8} placeholder={example} onChange={event => { setDraft(event.target.value); setInspection(null); }} />
      </Field>
      <Button type="submit" variant="secondary">{t("taskGraph.inspect")}</Button>
    </form>
    {inspection && !inspection.ok && <p role="alert">{t(`taskGraph.errors.${inspection.error}`)}</p>}
    {inspection?.ok && <section aria-label={t("taskGraph.results")} aria-live="polite">
      <p>{t("taskGraph.frontier", { tasks: inspection.frontier.join(", ") || t("taskGraph.none") })}</p>
      {!inspection.tasks.length && <p>{t("taskGraph.empty")}</p>}
      <ul className="task-graph-tasks">{inspection.tasks.map(task => <li key={task.id}>
        <strong>{task.title}</strong> <code>{task.id}</code>
        <p>{t("taskGraph.status", { status: t(`taskGraph.statuses.${task.status}`) })}</p>
        <p>{t("taskGraph.dependencies", { tasks: task.blockedBy.join(", ") || t("taskGraph.none") })}</p>
        {task.url && <p><span>{t("taskGraph.source")}</span> <code>{task.url}</code></p>}
      </li>)}</ul>
    </section>}
  </div>;
}

export function TaskGraphViewer({ onClose, returnFocus }: { onClose: () => void; returnFocus?: HTMLElement | null }) {
  return portalOverlay(<div className="overlay"><TaskGraphViewerContent onClose={onClose} returnFocus={returnFocus} /></div>);
}
