import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en, zhCN, flattenCatalog } from "@pi-desktop/i18n";
import { ENGINEERING_SHORTCUTS } from "@pi-desktop/shared";
import { EngineeringSkillSettings } from "../../apps/desktop/src/components/settings/EngineeringSkillSettings";
import { Composer } from "../../apps/desktop/src/components/Composer";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { api } from "../../apps/desktop/src/lib/api";
import { readEditorValue } from "../../apps/desktop/src/features/chat/composer/editor";

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
const input = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Default instruction"]')!;
const editor = () => document.querySelector<HTMLElement>(".composer-input")!;
async function type(value: string) { input().focus(); input().select(); await fixture("typeText", value); await until(() => input().value === value); }

globalThis.codingWorkbenchProbe = async () => {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: flattenCatalog(en) }, "zh-CN": { translation: flattenCatalog(zhCN) } }, interpolation: { escapeValue: false } });
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("sessionId")!;
  const projectPath = params.get("projectA")!;
  const settings = await api.getSettings();
  useAppStore.setState({ settings, activeSessionId: sessionId, sessions: (await api.listSessions()).sessions,
    workspace: { path: projectPath, name: "Project A" }, page: "chat", isRunning: false, runningSessions: {} });
  let root = createRoot(document.getElementById("root")!);
  const renderSettings = () => root.render(<I18nextProvider i18n={i18n}><EngineeringSkillSettings onUpdated={async () => {}} /></I18nextProvider>);
  const renderComposer = () => root.render(<I18nextProvider i18n={i18n}><Composer variant="home" /></I18nextProvider>);
  renderComposer(); await until(() => editor());
  const prefill = async (text: string) => { useAppStore.setState({ composerPrefill: { sessionId, text, fileReferences: [] } }); await until(() => readEditorValue(editor()) === text); };
  await prefill("Keep existing draft");
  renderSettings(); await until(() => input());
  for (const [locale, catalog] of [["en", en], ["zh-CN", zhCN]] as const) {
    await i18n.changeLanguage(locale);
    const entries = ENGINEERING_SHORTCUTS.filter(item => locale === "en" || item.action === "ask" || item.action === "review");
    for (const { action } of entries) {
      const trigger = await until(() => document.querySelector<HTMLButtonElement>(`button[aria-label="${catalog.settings.engineering.shortcut}"]`));
      trigger.click();
      await until(() => document.querySelector('[role="option"]'));
      await click(catalog.coding[action]);
      await until(() => {
        const guide = document.querySelector(".engineering-skill-description");
        return guide && ["when", "purpose", "example"].every(section => guide.textContent?.includes(catalog.coding.skillGuides[action][section as "when" | "purpose" | "example"]));
      });
      await until(() => document.querySelector<HTMLTextAreaElement>("textarea")?.value === catalog.coding.prompts[action]);
    }
  }
  await i18n.changeLanguage("en");
  const trigger = await until(() => document.querySelector<HTMLButtonElement>('button[aria-label="Shortcut"]'));
  trigger.click(); await until(() => document.querySelector('[role="option"]')); await click(en.coding.ask);
  await until(() => input()?.value === en.coding.prompts.ask);
  check(JSON.stringify((await api.getSettings()).engineeringShortcutPrompts) === JSON.stringify(settings.engineeringShortcutPrompts), "Reading guidance saved prompt overrides");
  await type("Inspect this project's verified blockers first."); await click("Save instruction");
  await until(async () => (await api.getSettings()).engineeringShortcutPrompts?.ask === "Inspect this project's verified blockers first.");
  renderComposer(); await until(() => editor() && readEditorValue(editor()) === "Keep existing draft");
  check(readEditorValue(editor()) === "Keep existing draft", "Settings edit rewrote an existing draft");
  await click("Ask"); await until(() => readEditorValue(editor()) === "/ask-matt Inspect this project's verified blockers first.\n\nKeep existing draft");
  root.unmount(); useAppStore.setState({ settings: await api.getSettings() });
  root = createRoot(document.getElementById("root")!); renderSettings();
  await until(() => input()?.value === "Inspect this project's verified blockers first.");
  await type(""); await click("Save instruction");
  await until(async () => (await api.getSettings()).engineeringShortcutPrompts?.ask === "");
  renderComposer(); await until(() => editor());
  await prefill(""); await click("Ask"); await until(() => readEditorValue(editor()) === "/ask-matt ");
  renderSettings(); await until(() => input());
  await click("Restore default");
  await until(async () => (await api.getSettings()).engineeringShortcutPrompts?.ask === null);
  renderComposer(); await until(() => editor());
  await prefill(""); await click("Ask"); await until(() => readEditorValue(editor()) === `/ask-matt ${en.coding.prompts.ask}`);
  renderSettings(); await until(() => input());
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
  check((await api.getSettings()).engineeringShortcutPrompts?.ask === null, "Update lost prompt preferences");
  await fixture("updateOffline", true); await click("Check for updates");
  await until(() => document.body.textContent?.includes("Check failed. Installed skills are retained"));
  check((await api.engineeringSkillStatus()).revision === "b".repeat(40), "Offline check changed installed skills");
  root.unmount();
  return { ok: true, descriptions: true, customized: true, persisted: true, empty: true, restored: true, manual: true, detected: true, updated: true, preserved: true, offline: true };
};
