import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineeringActivity, NavigatorControlInput } from "@pi-desktop/shared";
import { Button } from "../../components/ui";

export function NavigatorActivityControls({ activity, active, busy, onControl }: {
  activity: EngineeringActivity;
  active: boolean;
  busy: boolean;
  onControl?: (input: NavigatorControlInput) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = useRef(0);
  const admitted = useRef(false);
  useEffect(() => { owner.current++; setError(null); setPending(false); admitted.current = false;
    return () => { owner.current++; };
  }, [activity.sessionId, activity.id]);
  const control = async (action: NavigatorControlInput["action"]) => {
    if (!onControl || admitted.current || busy) return;
    admitted.current = true;
    const token = owner.current;
    setPending(true); setError(null);
    try { await onControl({ sessionId: activity.sessionId, activityId: activity.id, expectedVersion: activity.version, action }); }
    catch (cause) { if (owner.current === token) setError(String(cause)); }
    finally { if (owner.current === token) { setPending(false); admitted.current = false; } }
  };
  return <div className="navigator-activity-controls">
    <p>{t(activity.endedAt !== null ? "navigator.activityEnded" : active ? "navigator.activityBound" : "navigator.activityPaused")}</p>
    {active ? <>
      <Button disabled={busy || pending || !onControl} onClick={() => void control("leave")}>{t("navigator.leaveActivity")}</Button>
      <Button disabled={busy || pending || !onControl} onClick={() => void control("end")}>{t("navigator.endActivity")}</Button>
    </> : <Button disabled={busy || pending || !onControl} onClick={() => void control("continue")}>{t(activity.endedAt !== null ? "navigator.reopenActivity" : "navigator.continueActivity")}</Button>}
    {busy && <p>{t("navigator.boundaryBusy")}</p>}
    {!!activity.boundaries?.length && <details><summary>{t("navigator.boundaryHistory")}</summary>
      <ul>{activity.boundaries.map(event => <li key={event.version}>
        {t(event.action === "end" ? "navigator.endActivity" : event.action === "leave" ? "navigator.leaveActivity" : "navigator.continueActivity")}
        {" · "}<time dateTime={new Date(event.createdAt).toISOString()}>{new Date(event.createdAt).toLocaleString()}</time>
      </li>)}</ul>
    </details>}
    {error && <p role="alert">{t("navigator.controlFailed", { detail: error })}</p>}
  </div>;
}
