import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineeringActivity, NavigatorResult, NavigatorResultSnapshot } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Button, Input, Select } from "../../components/ui";

/** Result reads and corrections remain bound to their original activity. */
export function NavigatorResults({ activity, onChanged }: { activity: EngineeringActivity; onChanged?: () => void }) {
  const { t } = useTranslation();
  const messages = useAppStore(s => s.messages);
  const [snapshot, setSnapshot] = useState<NavigatorResultSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [kind, setKind] = useState<"file" | "validation">("file");
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const previewRevision = useRef(0);
  const input = { sessionId: activity.sessionId, activityId: activity.id };
  useEffect(() => {
    const token = ++generation.current;
    previewRevision.current++;
    setSnapshot(null); setPreview(null); setError(null); setBusy(false); busyRef.current = false;
    void api.listNavigatorResults({ sessionId: activity.sessionId, activityId: activity.id }).then(value => {
      if (token === generation.current) setSnapshot(value);
    }).catch(cause => { if (token === generation.current) setError(String(cause)); });
    return () => { generation.current++; previewRevision.current++; };
  }, [activity.id, activity.sessionId, activity.version, messages]);
  const act = async (operation: () => Promise<NavigatorResultSnapshot>) => {
    if (busyRef.current) return;
    const token = generation.current;
    busyRef.current = true; setBusy(true); setError(null);
    try { const value = await operation(); if (token === generation.current) { setSnapshot(value); onChanged?.(); } }
    catch (cause) { if (token === generation.current) setError(String(cause)); }
    finally { if (token === generation.current) { busyRef.current = false; setBusy(false); } }
  };
  const open = async (result: NavigatorResult) => {
    const token = ++previewRevision.current;
    setPreview(null); setError(null);
    if (result.kind === "reply") {
      const message = messages.find(item => item.id === result.sourceMessageId);
      if (message) { setPreview(message.content); return; }
      if (!result.sourceMessageId) { setPreview(t("navigator.results.sourceMissing")); return; }
      try {
        const context = await api.getSearchContext({ sessionId: activity.sessionId, messageId: result.sourceMessageId, query: "", direction: "around" });
        if (token === previewRevision.current) setPreview(context.messages.find(item => item.id === result.sourceMessageId)?.content ?? t("navigator.results.sourceMissing"));
      } catch (cause) { if (token === previewRevision.current) setError(`${t("navigator.results.sourceMissing")} ${String(cause)}`); }
      return;
    }
    if (result.kind === "validation") { setPreview(result.label); return; }
    try {
      const file = await api.readNavigatorResult({ ...input, resultId: result.id });
      if (token === previewRevision.current) setPreview(file.kind === "text" ? file.content ?? "" : t("navigator.results.nonText"));
    } catch (cause) { if (token === previewRevision.current) setError(t("navigator.results.fileUnavailable", { detail: String(cause) })); }
  };
  return <details><summary>{t("navigator.results.title")}</summary>
    {error && <p role="alert">{error}</p>}
    {snapshot?.results.length === 0 && <p>{t("navigator.results.unknown")}</p>}
    <ul>{snapshot?.results.map(result => <li key={result.id}>
      <Button onClick={() => void open(result)}>{result.label || t("navigator.results.reply")}</Button>
      <p>{t(`navigator.results.provenance.${result.provenance}`)} · {t(`navigator.results.verification.${result.verification}`)}</p>
      {result.path && <code>{result.path}</code>}
      {result.sourceMessageId && <small>{result.sourceMessageId}</small>}
      <Button disabled={busy} onClick={() => void act(() => api.removeNavigatorResult({ ...input, expectedVersion: snapshot.version, resultId: result.id }))}>{t("navigator.results.remove")}</Button>
    </li>)}</ul>
    {preview !== null && <pre className="navigator-result-preview">{preview}</pre>}
    <form onSubmit={event => { event.preventDefault(); if (snapshot) void act(() => api.addNavigatorResult({ ...input, expectedVersion: snapshot.version, kind, label, ...(kind === "file" ? { path } : {}) })); }}>
      <Select aria-label={t("navigator.results.kind")} value={kind} onChange={event => setKind(event.target.value === "file" ? "file" : "validation")}><option value="file">{t("navigator.results.file")}</option><option value="validation">{t("navigator.results.validation")}</option></Select>
      <Input aria-label={t("navigator.results.label")} value={label} onChange={event => setLabel(event.target.value)} required maxLength={4096} />
      {kind === "file" && <Input aria-label={t("navigator.results.path")} value={path} onChange={event => setPath(event.target.value)} required maxLength={4096} />}
      <p>{t("navigator.results.userCaution")}</p>
      <Button type="submit" disabled={busy || !snapshot}>{t("navigator.results.add")}</Button>
    </form>
  </details>;
}
