import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";

/** Expand only a referenced transcript message; never read project files. */
export function NavigatorSourcePreview({ sessionId, messageId, label }: { sessionId: string; messageId: string | null; label: string }) {
  const { t } = useTranslation();
  const sourceContent = useAppStore(s => s.activeSessionId === sessionId ? s.messages.find(message => message.id === messageId)?.content : undefined);
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!expanded) return;
    let current = true;
    setContent(null); setError(null);
    if (sourceContent !== undefined) setContent(sourceContent);
    else if (!messageId) setError(t("navigator.results.sourceMissing"));
    else void api.getSearchContext({ sessionId, messageId, query: "", direction: "around" }).then(context => {
      if (!current) return;
      const message = context.messages.find(item => item.id === messageId);
      if (message) setContent(message.content);
      else setError(t("navigator.results.sourceMissing"));
    }).catch(cause => { if (current) setError(`${t("navigator.results.sourceMissing")} ${String(cause)}`); });
    return () => { current = false; };
  }, [expanded, sessionId, messageId, sourceContent, t]);
  return <details onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{label}</summary>
    <code>{messageId}</code>
    {expanded && content === null && !error && <p role="status">{t("navigator.loading")}</p>}
    {error && <p role="alert">{error}</p>}
    {content !== null && <pre>{content}</pre>}
  </details>;
}
