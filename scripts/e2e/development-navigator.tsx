import { createRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { en, flattenCatalog } from "@pi-desktop/i18n";
import type { NavigatorSnapshot } from "@pi-desktop/shared";
import { NavigatorTab } from "../../apps/desktop/src/features/navigator/NavigatorTab";
import { Composer } from "../../apps/desktop/src/components/Composer";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { api } from "../../apps/desktop/src/lib/api";
import { loadCodingActions } from "../../apps/desktop/src/features/extensions/coding-action-state";
import { readEditorValue } from "../../apps/desktop/src/features/chat/composer/editor";
import { until, check, click, fill } from "./skill-shortcuts-helpers";

declare global {
  var navigatorProbe: () => Promise<{ activityId: string; prompts: number }>;
  var navigatorRestored: (checkpoint: { activityId: string; prompts: number }) => Promise<unknown>;
  interface Window { workflowFixture: { action: (name: string, input?: unknown) => Promise<unknown> } }
}
const fixture = (name: string, input?: unknown) => window.workflowFixture.action(name, input);
const editor = () => document.querySelector<HTMLElement>(".composer-input")!;
const refresh = () => click(i18n.t("navigator.refresh"));
const visibleCount = () => document.querySelectorAll(".navigator-activities > li").length;
async function initialize() {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: flattenCatalog(en) } }, interpolation: { escapeValue: false } });
  const params = new URLSearchParams(location.search);
  const sessionId = params.get("sessionId")!, projectPath = params.get("projectA")!;
  await api.setProject(projectPath);
  const settings = await api.getSettings();
  const sessions = (await api.listSessions()).sessions;
  useAppStore.setState({ settings, activeSessionId: sessionId, sessions: sessions.map(session => ({ ...session, providerId: "workflow-fixture", modelId: "fixture-model" })),
    providers: [{ id: "workflow-fixture", name: "Fixture", vendorKey: "custom", type: "custom", protocol: "openai-completions", enabled: true, authKind: "none", hasSecret: false, models: [{ id: "fixture-model", contextWindow: 32000, maxTokens: 2048, thinkingLevels: ["off"], defaultThinkingLevel: "off" }], supportsReasoning: false, supportedThinkingLevels: ["off"] }],
    workspace: { path: projectPath, name: "Project A" }, page: "chat", isRunning: false, runningSessions: {} });
  await loadCodingActions();
  createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18n}><NavigatorTab /><Composer variant="home" /></I18nextProvider>);
  await until(() => editor() && document.querySelector(".navigator-tab"));
  const records = () => api.listNavigator(sessionId);
  return { sessionId, records };
}
async function send(text?: string) {
  editor().focus();
  if (text) await fixture("typeText", text);
  await fixture("pressKey", "Enter");
}
async function completed(sessionId: string, expectedPrompts: number) {
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === expectedPrompts);
  await fixture("releaseProvider");
  await until(async () => {
    const value = await api.listNavigator(sessionId);
    const requests = value.activities.flatMap(activity => activity.requests);
    return requests.length >= expectedPrompts && requests.every(request => request.outcome === "normal");
  });
  // The fixture's external stream is not the production UI event transport.
  // Reload the authoritative transcript, rather than inventing activity state.
  const { session } = await api.getSession(sessionId);
  useAppStore.setState({ messages: session?.messages ?? [], isRunning: false, runningSessions: {}, agentStatuses: {} });
  await refresh();
}
async function currentActivity(records: () => Promise<NavigatorSnapshot>, requests: number) {
  return until(async () => { const snapshot = await records(); return snapshot.activities.length === 1 && snapshot.activities[0].requests.length === requests ? snapshot.activities[0] : false; });
}
globalThis.navigatorProbe = async () => {
  const { sessionId, records } = await initialize();
  check((await records()).activities.length === 0, "Empty conversation contains invented activities");
  const actions = (await api.getCodingActions()).configuration.actions;
  const requirements = actions.find(action => action.skillId === "grill-with-docs")!;
  await click(requirements.label);
  await until(() => readEditorValue(editor()).startsWith("/grill-with-docs"));
  check((await records()).activities.length === 0, "Unsent button draft created an activity");
  await fixture("releaseLaunch");
  await send(); await completed(sessionId, 1);
  let activity = await currentActivity(records, 1);
  check(activity.endedAt === null, "Individual reply ended the discussion");
  await send("My ordinary answer continues the same requirements discussion.");
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 2);
  await fixture("releaseProvider");
  await until(async () => (await records()).activities[0].requests.length === 2 && (await records()).activities[0].requests.every(request => request.outcome === "normal"));
  const { session } = await api.getSession(sessionId);
  useAppStore.setState({ messages: session?.messages ?? [], isRunning: false, runningSessions: {}, agentStatuses: {} });
  await refresh();
  activity = await currentActivity(records, 2);
  check(activity.endedAt === null, "Ordinary answer ended the activity");
  check((await fixture("snapshot") as { prompts: number }).prompts === 2, "Reply termination requested navigation automatically");
  await click(i18n.t("navigator.leaveActivity"));
  await until(async () => !(await records()).activeActivityId);
  await until(() => [...document.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent === i18n.t("navigator.continueActivity")));
  await click(i18n.t("navigator.continueActivity"));
  await until(async () => (await records()).activeActivityId === activity.id);
  await click(i18n.t("navigator.endActivity"));
  await until(async () => (await records()).activities[0].endedAt !== null);
  await until(() => document.body.textContent?.includes(i18n.t("navigator.activityEnded")));
  activity = (await records()).activities[0];
  check(activity.boundaries?.map(event => event.action).join(",") === "leave,continue,end", "Boundary history lost an event");
  const summary = await until(() => [...document.querySelectorAll<HTMLElement>("summary")].find(item => item.textContent === i18n.t("navigator.results.title")));
  summary.click();
  await click(i18n.t("navigator.results.reply"));
  await until(() => document.querySelector(".navigator-result-preview")?.textContent?.includes("Requirements clarified"));
  await fill(i18n.t("navigator.results.label"), "Fixture file", value => fixture("typeText", value));
  await fill(i18n.t("navigator.results.path"), "navigator-result.md", value => fixture("typeText", value));
  await click(i18n.t("navigator.results.add"));
  await click("Fixture file");
  await until(() => document.querySelector(".navigator-result-preview")?.textContent === "Navigator fixture evidence");
  await click(i18n.t("navigator.manageHistory"));
  await click(i18n.t("navigator.hide"));
  await until(() => visibleCount() === 0);
  check((await api.getSession(sessionId)).session?.messages.length === session?.messages.length, "Hiding deleted source messages");
  await click(i18n.t("navigator.restore"));
  await until(() => visibleCount() === 1);
  return { activityId: activity.id, prompts: (await fixture("snapshot") as { prompts: number }).prompts };
};
globalThis.navigatorRestored = async checkpoint => {
  const { records } = await initialize();
  const activity = await until(async () => (await records()).activities.find(item => item.id === checkpoint.activityId));
  check(activity.requests.length === 2 && activity.endedAt !== null && !activity.hidden, "Restart changed activity history");
  await until(() => visibleCount() === 1);
  check((await fixture("snapshot") as { prompts: number }).prompts === checkpoint.prompts, "Restart replayed execution");
  return { ok: true, multiRound: true, boundaries: true, results: true, history: true, persisted: true, noReplay: true };
};
