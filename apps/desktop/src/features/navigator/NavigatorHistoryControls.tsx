import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineeringActivity } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Button } from "../../components/ui";
import { createNavigatorHistory } from "./navigator-history";

export function NavigatorHistoryControls({ sessionId, activities, onChanged }: {
  sessionId: string; activities: EngineeringActivity[]; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useRef(onChanged);
  refresh.current = onChanged;
  const history = useMemo(() => createNavigatorHistory(api.setNavigatorHidden, () => refresh.current(), setError), []);
  useEffect(() => { history.select(sessionId); return () => history.dispose(); }, [history, sessionId]);
  const change = async (activityId: string, hidden: boolean) => {
    setPending(true); setError(null);
    await history.setHidden(activityId, hidden);
    setPending(false);
  };
  return <div>
    <Button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t("navigator.manageHistory")}</Button>
    {expanded && <div>
      <p>{t("navigator.hideExplanation")}</p>
      <ul>{activities.map(activity => <li key={activity.id}>
        <span>{activity.requests.flatMap(request => request.requestedSkills).join(", ")}</span>{" "}
        <Button disabled={pending} onClick={() => void change(activity.id, !activity.hidden)}>
          {t(activity.hidden ? "navigator.restore" : "navigator.hide")}
        </Button>
      </li>)}</ul>
    </div>}
    {error && <p role="alert">{t("navigator.historyFailed", { detail: error })}</p>}
  </div>;
}
