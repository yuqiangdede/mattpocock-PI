import i18n from "i18next";
import { resolveLocale } from "@pi-desktop/i18n";
import type { AppSettings } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";

export type AppLanguageSetting = NonNullable<AppSettings["language"]>;

/** Concrete locale for a stored language setting; `auto`/absent follows the OS. */
export function resolveAppLanguage(
  language: AppSettings["language"],
): "en" | "zh-CN" {
  if (language === "en" || language === "zh-CN") return language;
  return resolveLocale(
    navigator.language || (navigator as { userLanguage?: string }).userLanguage,
  );
}

export function applyAppLanguage(language: AppSettings["language"]) {
  const target = resolveAppLanguage(language);
  document.documentElement.lang = target;
  if (i18n.language !== target) void i18n.changeLanguage(target);
}

/** Keep i18n in step with the persisted settings.language for the app lifetime. */
export function initLanguageSync() {
  applyAppLanguage(useAppStore.getState().settings?.language);
  useAppStore.subscribe((state, prev) => {
    if (state.settings?.language !== prev.settings?.language) {
      applyAppLanguage(state.settings?.language);
    }
  });
}
