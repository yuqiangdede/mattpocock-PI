import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en, zhCN, flattenCatalog } from "@pi-desktop/i18n";
import { EngineeringSkillSettings } from "../../apps/desktop/src/components/settings/EngineeringSkillSettings";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { api } from "../../apps/desktop/src/lib/api";

declare global { var codingWorkbenchProbe: (requirementsOnly?: boolean) => Promise<unknown>; interface Window { workflowFixture: { action: (name: string, input?: unknown) => Promise<unknown> } } }
const fixture = (name: string, input?: unknown) => window.workflowFixture.action(name, input);
async function until<T>(read: () => T | false | null | Promise<T | false | null>): Promise<T> {
  const end = performance.now() + 15000;
  while (performance.now() < end) { const value = await read(); if (value) return value; await new Promise<void>(requestAnimationFrame); }
  throw new Error(`Engineering settings timed out: ${document.body.textContent?.slice(-1200)}`);
}
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
async function click(label: string) {
  const button = await until(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label && !item.disabled));
  button.focus(); button.click();
}

globalThis.codingWorkbenchProbe = async () => {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: flattenCatalog(en) }, "zh-CN": { translation: flattenCatalog(zhCN) } }, interpolation: { escapeValue: false } });
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("sessionId")!;
  const projectPath = params.get("projectA")!;
  const settings = await api.getSettings();
  useAppStore.setState({ settings, activeSessionId: sessionId, sessions: (await api.listSessions()).sessions,
    workspace: { path: projectPath, name: "Project A" }, page: "chat", isRunning: false, runningSessions: {} });
  const root = createRoot(document.getElementById("root")!);
  const renderSettings = () => root.render(<I18nextProvider i18n={i18n}><EngineeringSkillSettings onUpdated={async () => {}} /></I18nextProvider>);
  renderSettings();
  await until(() => document.body.textContent?.includes('Automatic detection, manual update'));
  await click("Automatic detection, manual update"); await click("Manual detection and update");
  await until(async () => (await api.getSettings()).engineeringSkillUpdateMode === "manual");
  const original = (await api.engineeringSkillStatus()).revision;
  await click("Check for updates"); await until(() => document.body.textContent?.includes("Update available"));
  check((await api.engineeringSkillStatus()).revision === original, "Detection installed a bundle");
  await fixture("customizeBundledSkill");
  await click("Update engineering skills");
  await until(async () => (await api.engineeringSkillStatus()).revision === "b".repeat(40));
  await until(() => document.body.textContent?.includes("Matches detected upstream"));
  check((await api.engineeringSkillStatus()).preserved?.includes("retro"), "Update lost preservation report");
  const retained = await fixture("readCustomizedSkill") as { body: string; skill: { enabled: boolean } };
  check(retained.body.includes("Local fixture customization.") && retained.skill.enabled === false, "Update overwrote local content or activation");
  check(JSON.stringify((await api.getSettings()).engineeringShortcutPrompts) === JSON.stringify(settings.engineeringShortcutPrompts), "Update lost legacy prompt preferences");
  await fixture("updateOffline", true); await click("Check for updates");
  await until(() => document.body.textContent?.includes("Check failed. Installed skills are retained"));
  check((await api.engineeringSkillStatus()).revision === "b".repeat(40), "Offline check changed installed skills");
  root.unmount();
  return { ok: true, manual: true, detected: true, updated: true, preserved: true, offline: true };
};
