import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NavigatorSnapshot, NavigatorControlInput } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Button, Panel } from "../../components/ui";
import { createNavigatorReader } from "./navigator-reader";
import { NavigatorHistoryControls } from "./NavigatorHistoryControls";
import { NavigatorActivityControls } from "./NavigatorActivityControls";
import { NavigatorResults } from "./NavigatorResults";
import { NavigatorAnalysis } from "./NavigatorAnalysis";

export function NavigatorTab() {
  const { t } = useTranslation();
  const sessionId = useAppStore(s => s.activeSessionId);
  const messages = useAppStore(s => s.messages);
  const status = useAppStore(s => sessionId ? s.agentStatuses[sessionId] : undefined);
  const [snapshot, setSnapshot] = useState<NavigatorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsupported = sessionId?.startsWith("native-pi:") ?? false;
  const reader = useMemo(() => createNavigatorReader(api.listNavigator, (value, failure) => {
    setSnapshot(value); setError(failure);
  }), []);
  useEffect(() => {
    reader.select(unsupported ? undefined : sessionId);
    void reader.refresh();
    return () => reader.dispose();
  }, [reader, sessionId, unsupported]);
  useEffect(() => { void reader.refresh(); }, [reader, messages, status]);
  return <NavigatorView sessionId={sessionId} snapshot={snapshot} error={error} busy={status?.isRunning ?? false} onControl={async input => { await api.controlNavigator(input); await reader.refresh(); }} onRefresh={() => void reader.refresh()} />;
}

export function NavigatorView({ sessionId, snapshot, error, onRefresh, onControl, busy = false }: {
  sessionId: string | undefined;
  snapshot: NavigatorSnapshot | null;
  error: string | null;
  onRefresh: () => void;
  onControl?: (input: NavigatorControlInput) => Promise<unknown>;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const unsupported = sessionId?.startsWith("native-pi:") ?? false;
  const activities = snapshot?.activities.filter(activity => !activity.hidden) ?? [];
  const bound = snapshot?.activities.find(activity => activity.id === snapshot.activeActivityId);
  return <section className="navigator-tab" aria-label={t("navigator.title")}>
    <div className="navigator-toolbar"><h2>{t("navigator.title")}</h2>
      <Button disabled={!sessionId || unsupported} onClick={onRefresh}>{t("navigator.refresh")}</Button>
    </div>
    <p>{t("navigator.explanation")}</p>
    {sessionId && !unsupported && snapshot && <NavigatorHistoryControls key={sessionId} sessionId={sessionId} activities={snapshot.activities} onChanged={onRefresh} />}
    {bound && <div role="status"><h3>{t("navigator.currentActivity", { skills: bound.requests.flatMap(request => request.requestedSkills).join(", ") })}</h3>
      <NavigatorActivityControls key={bound.id} activity={bound} active busy={busy} onControl={onControl} />
    </div>}
    {unsupported && <p role="status">{t("navigator.unsupported")}</p>}
    {error && <p role="alert">{t("navigator.loadFailed", { detail: error })}</p>}
    {!sessionId ? <p>{t("navigator.sessionRequired")}</p> : !unsupported && !snapshot && !error ? <p role="status">{t("navigator.loading")}</p> : null}
    {snapshot?.unavailableCount ? <p role="status">{t("navigator.unavailable", { count: snapshot.unavailableCount })}</p> : null}
    {snapshot && activities.length === 0 && !bound && <p>{t("navigator.empty")}</p>}
    <ul className="navigator-activities">
      {activities.map(activity => <li key={activity.id}>
        <Panel>
          <h3>{activity.requests.flatMap(request => request.requestedSkills).join(", ")}</h3>
          <time dateTime={new Date(activity.createdAt).toISOString()}>{new Date(activity.createdAt).toLocaleString()}</time>
          {activity.id !== bound?.id && <NavigatorActivityControls activity={activity} active={false} busy={busy} onControl={onControl} />}
          {activity.requests.map(request => <div key={request.id}>
            <p>{t(`navigator.outcomes.${request.outcome}`)}</p>
            {request.requestedSkills.map(skill => <p key={skill}>{skill}: {t(request.observedSkills.includes(skill) ? "navigator.actualUseObserved" : "navigator.actualUseUnknown")}</p>)}
            {request.errorCode && <p>{request.errorCode}</p>}
          </div>)}
          <NavigatorResults activity={activity} onChanged={onRefresh} />
          <NavigatorAnalysis activity={activity} busy={busy} />
        </Panel>
      </li>)}
    </ul>
  </section>;
}
