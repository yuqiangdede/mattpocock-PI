import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Field, Input, Select, portalOverlay } from "../../components/ui";
import { useBlockingOverlay } from "../../lib/blocking-overlay";
import { useRequirementsConfirmation } from "./useRequirementsConfirmation";

function RequirementsConfirmationDialog({ projectPath, onClose }: { projectPath: string; onClose: () => void }) {
  const { t } = useTranslation();
  const workflow = useRequirementsConfirmation(projectPath);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  useBlockingOverlay();
  useEffect(() => {
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (focus?.isConnected) focus.focus(); };
  }, []);
  const errorCode = workflow.error?.match(/REQUIREMENTS_[A-Z_]+/)?.[0] ?? "REQUIREMENTS_UNAVAILABLE";
  return portalOverlay(<dialog ref={dialog} className="requirements-confirmation-dialog" aria-labelledby={title} aria-describedby={description}
    onCancel={event => { event.preventDefault(); if (!workflow.busy) onClose(); }}>
    <h3 id={title}>{t("coding.requirements.title")}</h3>
    <p id={description}>{t("coding.requirements.description")}</p>
    <Field label={t("coding.requirements.root")}>
      <Select aria-label={t("coding.requirements.root")} value={workflow.root} disabled={workflow.busy || !workflow.group}
        onChange={event => workflow.select(event.currentTarget.value, "")}>
        {workflow.group?.roots.map(root => <option key={root.path} value={root.path}>{root.name}</option>)}
      </Select>
    </Field>
    <Field label={t("coding.requirements.path")} hint={t("coding.requirements.pathHint")}>
      <Input aria-label={t("coding.requirements.path")} value={workflow.path} disabled={workflow.busy || !workflow.group}
        onChange={event => workflow.select(workflow.root, event.currentTarget.value)} placeholder={t("coding.requirements.pathPlaceholder")} />
    </Field>
    <Button type="button" disabled={workflow.busy || !workflow.group || !workflow.path.trim()} onClick={() => void workflow.refresh()}>{t("coding.requirements.preview")}</Button>
    {workflow.busy ? <p role="status">{t("coding.requirements.loading")}</p> : null}
    {workflow.error ? <p role="alert">{t(`coding.requirements.errors.${errorCode}`, { defaultValue: t("coding.requirements.errors.REQUIREMENTS_UNAVAILABLE") })}</p> : null}
    {workflow.preview ? <section aria-label={t("coding.requirements.preview")}>
      <Badge tone={workflow.preview.status === "confirmed" ? "success" : "neutral"}>{t(`coding.requirements.status.${workflow.preview.status}`)}</Badge>
      <h4>{t("coding.requirements.summary")}</h4>
      <pre className="requirements-summary">{workflow.preview.summary}</pre>
      <details><summary>{t("coding.requirements.content")}</summary><pre className="requirements-content">{workflow.preview.content}</pre></details>
      <p>{t("coding.requirements.version", { version: workflow.preview.contentHash.slice(0, 12) })}</p>
      {workflow.preview.status === "changed" ? <p>{t("coding.requirements.changedHint")}</p> : null}
    </section> : null}
    {workflow.history?.confirmations.length ? <details><summary>{t("coding.requirements.history", { count: workflow.history.confirmations.length })}</summary>
      <ul>{[...workflow.history.confirmations].reverse().map(record => <li key={record.id}>
        <Button type="button" variant="ghost" disabled={workflow.busy || !workflow.group?.roots.some(root => root.path === record.workspaceRoot)} onClick={() => workflow.select(record.workspaceRoot, record.relativePath)}>{record.relativePath}</Button>
        <span>{t("coding.requirements.record", { version: record.contentHash.slice(0, 12), date: new Date(record.confirmedAt).toLocaleString() })}</span>
      </li>)}</ul>
    </details> : null}
    <div className="requirements-confirmation-actions">
      <Button type="button" onClick={onClose} disabled={workflow.busy}>{t("common.cancel")}</Button>
      <Button type="button" variant="primary" disabled={workflow.busy || !workflow.preview || workflow.preview.status === "confirmed"} onClick={() => void workflow.confirm()}>{t("coding.requirements.confirm")}</Button>
    </div>
  </dialog>);
}

export function RequirementsConfirmation({ projectPath, disabled = false }: { projectPath: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const [openFor, setOpenFor] = useState<string | null>(null);
  useEffect(() => { setOpenFor(current => current === projectPath ? current : null); }, [projectPath]);
  return <>
    <Button type="button" disabled={disabled || !projectPath} title={t("coding.requirements.hint")} onClick={() => setOpenFor(projectPath)}>{t("coding.requirements.action")}</Button>
    {openFor === projectPath && projectPath ? <RequirementsConfirmationDialog key={projectPath} projectPath={projectPath} onClose={() => setOpenFor(null)} /> : null}
  </>;
}
