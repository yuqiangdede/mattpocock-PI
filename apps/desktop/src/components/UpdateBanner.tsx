import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { UpdateState } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useUpdateState } from "../lib/use-update-state";
import { Button } from "./ui";
import { IconClose, IconCloudDown, IconExternal } from "./icons";

/**
 * Ambient update prompt (bottom-right). Appears when an update is ready to
 * install (in-app mode) or newly detected (manual mode); silent otherwise.
 * The Settings → Info tab owns explicit checks and detailed status.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const update = useUpdateState();
  const [dismissedState, setDismissedState] = useState<string | null>(null);

  if (!update?.availableVersion) return null;
  const stateKey = `${update.availableVersion}:${update.status}`;
  if (stateKey === dismissedState) return null;

  const visible =
    update.status === "downloaded" ||
    update.status === "downloading" ||
    (update.status === "available" && update.mode === "manual");
  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2 rounded-lg-plus border border-border-subtle bg-bg-elevated-opaque p-3 shadow-lg"
    >
      <div className="flex items-start gap-2">
        <IconCloudDown className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1 text-sm text-text-primary">
          {bannerMessage(update, t)}
        </div>
        <button
          type="button"
          aria-label={t("updates.dismiss")}
          className="rounded-md p-0.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          onClick={() => setDismissedState(stateKey)}
        >
          <IconClose className="size-3.5" />
        </button>
      </div>
      {update.status === "downloaded" && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void api.updatesInstall().catch(() => undefined)}
          >
            {t("updates.restart")}
          </Button>
        </div>
      )}
      {update.status === "available" && update.mode === "manual" && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void api.updatesOpenReleases().catch(() => undefined)}
          >
            <IconExternal className="size-3.5" />
            {t("updates.viewRelease")}
          </Button>
        </div>
      )}
    </div>
  );
}

function bannerMessage(
  update: UpdateState,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (update.status === "downloading") {
    return t("updates.downloading", { percent: update.progressPercent ?? 0 });
  }
  if (update.status === "downloaded") {
    return t("updates.downloaded", { version: update.availableVersion });
  }
  return t("updates.available", { version: update.availableVersion });
}
