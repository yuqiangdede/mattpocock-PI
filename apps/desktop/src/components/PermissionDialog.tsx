import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { Button } from "./ui";

const PERMISSION_TIMEOUT_S = 120;

export function PermissionDialog() {
  const { t } = useTranslation();
  const permission = useAppStore((s) => s.permission);
  const resolvePermission = useAppStore((s) => s.resolvePermission);
  const [secondsLeft, setSecondsLeft] = useState(PERMISSION_TIMEOUT_S);

  // Host auto-denies at 120s (D005). Mirror the countdown client-side and
  // close the dialog when it expires instead of leaving it stuck open.
  useEffect(() => {
    if (!permission) return;
    setSecondsLeft(PERMISSION_TIMEOUT_S);
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [permission?.requestId]);

  useEffect(() => {
    if (!permission || secondsLeft > 0) return;
    void (async () => {
      try {
        await resolvePermission("deny");
      } catch {
        // host already auto-denied; clearing local state is what matters
        useAppStore.setState({ permission: null });
      }
    })();
  }, [secondsLeft, permission, resolvePermission]);

  // Stringify once per request, not on every countdown tick.
  const argsText = useMemo(
    () => JSON.stringify(permission?.argsPreview ?? null, null, 2),
    [permission],
  );

  if (!permission) return null;

  const risk = (permission.risk || "high") as "low" | "medium" | "high";

  return (
    <div className="overlay">
      <div className="dialog">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-base-plus font-medium">{t("permission.title")}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-2xs uppercase tracking-wide ${
              risk === "high"
                ? "border-error/40 text-error"
                : risk === "medium"
                  ? "border-warning/40 text-warning"
                  : "border-border-strong text-text-muted"
            }`}
          >
            {t(`permission.risk.${risk}`)}
          </span>
        </div>
        <div className="mb-1 text-md text-text-secondary">
          <Trans
            i18nKey="permission.allowPrompt"
            values={{ tool: permission.toolName }}
            components={{ highlight: <span className="text-text-primary" /> }}
          />
        </div>
        {permission.reason ? (
          <div className="mb-3 text-sm text-text-muted">{permission.reason}</div>
        ) : null}
        <pre className="mb-3 max-h-40 overflow-auto rounded-md-plus border border-border-subtle bg-bg-inset p-3 font-mono text-xs-plus text-text-secondary">
          {argsText}
        </pre>
        <div className="mb-3 text-xs-plus text-text-muted" role="timer">
          {t("permission.countdown", { seconds: Math.max(secondsLeft, 0) })}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void resolvePermission("deny")}>
            {t("permission.deny")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void resolvePermission("allow-session")}
          >
            {t("permission.allowSession")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void resolvePermission("allow-once")}
          >
            {t("permission.allowOnce")}
          </Button>
        </div>
      </div>
    </div>
  );
}
