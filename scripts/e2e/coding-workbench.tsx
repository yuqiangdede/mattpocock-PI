import { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en, flattenCatalog } from "@pi-desktop/i18n";
import { CodingWorkbench } from "../../apps/desktop/src/features/coding/CodingWorkbench";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { api } from "../../apps/desktop/src/lib/api";

declare global { var codingWorkbenchProbe: () => Promise<unknown>; interface Window { workflowFixture: { action: (name: string, input?: unknown) => Promise<unknown> } } }
const params = new URLSearchParams(location.search);
const sessionId = params.get("sessionId")!;
const projectPath = params.get("projectA")!;
function Fixture() { const [home, setHome] = useState(true); return <I18nextProvider i18n={i18n}><CodingWorkbench home={home} onHome={() => setHome(true)} onChat={() => setHome(false)} /></I18nextProvider>; }
const ready = (async () => {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: flattenCatalog(en) } }, interpolation: { escapeValue: false } });
  const sessions = (await api.listSessions()).sessions;
  useAppStore.setState({ activeSessionId: sessionId, sessions, workspace: { path: projectPath, name: "Project A" }, page: "chat", runningSessions: {} });
  createRoot(document.getElementById("root")!).render(<Fixture />);
})();
async function until<T>(read: () => T | false | null | Promise<T | false | null>): Promise<T> {
  const end = performance.now() + 12000;
  while (performance.now() < end) { const value = await read(); if (value) return value; await new Promise<void>(requestAnimationFrame); }
  throw new Error(`Coding workbench fixture timed out. Panel: ${document.querySelector('.coding-task-panel')?.textContent?.slice(-1200)}. Workbench: ${document.body.textContent?.slice(-1000)}`);
}
async function click(label: string, closeOnStart = true) {
  const control = await until(() => [...(document.querySelector(".coding-task-panel") ?? document).querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label && !item.disabled));
  control.click();
  if (label === "Start" && closeOnStart) await until(() => !document.querySelector(".coding-task-panel"));
}
async function action(label: string) {
  const card = await until(() => [...document.querySelectorAll<HTMLElement>(".coding-card")].find((item) => item.querySelector("strong")?.textContent === label));
  card.querySelector<HTMLButtonElement>("button")!.focus();
  card.querySelector<HTMLButtonElement>("button")!.click();
}
async function type(text: string) {
  const textarea = await until(() => document.querySelector<HTMLTextAreaElement>(".coding-task-panel textarea"));
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await until(() => !document.querySelector<HTMLButtonElement>(".coding-task-panel .coding-actions button:last-child")?.disabled);
}
const fixture = (name: string, input?: unknown) => window.workflowFixture.action(name, input);
globalThis.codingWorkbenchProbe = async () => {
  await ready;
  await until(() => document.querySelectorAll(".coding-card").length === 8);
  await fixture("reset"); await fixture("releaseLaunch");
  await action("Implement"); await type("Add a useful empty state without a ticket"); await click("Start");
  const running = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.phase === "running"));
  await fixture("releaseProvider");
  await until(async () => (await api.readFreeTask(running.id)).phase === "completed");
  await click("Coding Tools");
  const result = await until(() => document.querySelector<HTMLElement>(".coding-result"));
  await until(() => result.textContent?.includes("Reply completed"));
  result.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { if (button.textContent === "Review code") button.click(); });
  const context = await until(() => document.querySelectorAll<HTMLTextAreaElement>(".coding-task-panel textarea")[1]);
  if (!context.value.includes(`task:${running.id}`)) throw new Error("No explicit result reference in review intake");
  await click("Remove reference");
  await until(() => context.value === "");
  await fixture("reset"); await fixture("releaseLaunch"); await click("Start");
  const review = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.action === "review" && task.phase === "running"));
  if (review.references.length !== 0) throw new Error("Removed context was still submitted");
  await fixture("releaseProvider"); await until(async () => (await api.readFreeTask(review.id)).phase === "completed");
  const skills = await fixture("snapshot") as { skillIds: string[] };
  if (!skills.skillIds.includes("implement") || !skills.skillIds.includes("code-review")) throw new Error("Actual skills were not loaded");
  for (const [label, expected] of [["Retrospective", "retro"], ["Split tickets", "to-tickets"], ["Discuss requirements", "grill-with-docs"], ["Form specification", "to-spec"], ["Diagnose bug", "diagnosing-bugs"]]) {
    console.info("CODING_PHASE", label);
    await fixture("reset"); await fixture("releaseLaunch");
    await action(label); await type(`Independent ${label} request`); await click("Start");
    const attempt = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.phase === "running"));
    console.info("CODING_ADMITTED", label);
    await fixture("releaseProvider"); await until(async () => (await api.readFreeTask(attempt.id)).phase === "completed");
    const snapshot = await fixture("snapshot") as { skillIds: string[] };
    if (snapshot.skillIds.at(-1) !== expected) throw new Error(`Wrong skill for ${label}`);
  }
  const ordinary = await fixture("hostCall", { method: "session.beginTurn", params: { sessionId } }) as { turnId: string };
  await action("Implement"); await type("Wait without losing input"); await click("Wait for current task");
  const waitingTask = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.phase === "waiting"));
  await click("Withdraw waiting task");
  await until(async () => (await api.readFreeTask(waitingTask.id)).phase === "cancelled");
  await fixture("hostCall", { method: "session.endTurn", params: { turnId: ordinary.turnId, status: "completed", createNotification: false } });
  const nextOrdinary = await fixture("hostCall", { method: "session.beginTurn", params: { sessionId } }) as { turnId: string };
  await fixture("reset"); await fixture("releaseLaunch");
  await action("Review code"); await type("Review when the current task ends"); await click("Wait for current task");
  const queuedReview = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.phase === "waiting"));
  await fixture("hostCall", { method: "session.endTurn", params: { turnId: nextOrdinary.turnId, status: "completed", createNotification: false } });
  await until(async () => (await api.readFreeTask(queuedReview.id)).phase === "running");
  await fixture("releaseProvider"); await until(async () => (await api.readFreeTask(queuedReview.id)).phase === "completed");
  await fixture("reset", "cancelFailure"); await fixture("releaseLaunch");
  await action("Implement"); await type("Cancellation ownership probe"); await click("Start");
  const cancellation = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.phase === "running"));
  let refused = false; try { await api.abort(cancellation.sessionId); } catch { refused = true; }
  if (!refused || (await api.readFreeTask(cancellation.id)).phase !== "running") throw new Error("Cancellation failure falsely settled the task");
  await fixture("releaseProvider");
  await until(async () => (await api.readFreeTask(cancellation.id)).phase === "completed");
  await fixture("reset"); await fixture("releaseLaunch");
  await action("Implement"); await type("Explicit cancellation probe"); await click("Start");
  const stopped = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.phase === "running"));
  await api.stopFreeTask(stopped.id);
  await until(async () => (await api.readFreeTask(stopped.id)).phase === "cancelled");
  await action("Initialize project"); await type("Prepare this coding project"); await click("Preview initialization");
  await until(() => document.querySelectorAll(".coding-task-panel input[type=checkbox]").length === 4);
  await fixture("blockInitialization");
  await click("Apply selected files");
  const failedInit = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.action === "initialize" && task.phase === "failed"));
  await click("Close");
  const failedCard = await until(() => [...document.querySelectorAll<HTMLElement>(".coding-result")].find((item) => item.querySelector("strong")?.textContent?.includes("Initialize project") && item.textContent?.includes("Failed")));
  failedCard.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { if (button.textContent === "Retry") button.click(); });
  await until(() => document.querySelectorAll(".coding-task-panel input[type=checkbox]:checked").length === 1);
  await fixture("unblockInitialization"); await click("Apply selected files");
  await until(async () => (await api.listFreeTasks(projectPath)).tasks.some((task) => task.action === "initialize" && task.phase === "completed"));
  if ((await fixture("readInitializationConvention")) !== "Later user configuration") throw new Error("Retry replaced completed user-edited content");
  if ((await api.readFreeTask(failedInit.id)).phase !== "failed") throw new Error("Retry overwrote the earlier failed outcome");
  await click("Close");
  await action("Review code");
  await fixture("resize", { width: 460, height: 740 });
  await until(() => innerWidth <= 460);
  if (document.documentElement.scrollWidth > innerWidth + 1) throw new Error("Narrow workbench overflows horizontally");
  if (document.querySelector(".coding-grid") && getComputedStyle(document.querySelector(".coding-grid")!).gridTemplateColumns.split(" ").length !== 1) throw new Error("Narrow workbench cards do not stack");
  await until(() => document.activeElement instanceof HTMLTextAreaElement);
  const focus = document.activeElement;
  if (!(focus instanceof HTMLTextAreaElement)) throw new Error("Task panel did not focus description");
  const last = [...document.querySelectorAll<HTMLElement>(".coding-task-panel button:not(:disabled), .coding-task-panel input:not(:disabled), .coding-task-panel textarea:not(:disabled), .coding-task-panel select:not(:disabled)")].at(-1)!;
  last.focus(); last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  if (document.activeElement === last) throw new Error("Task panel did not trap focus");
  await click("Close");
  await fixture("resize", { width: 900, height: 760 });
  await action("Initialize project"); await click("Create new project"); await click("Choose parent directory");
  const name = await until(() => [...document.querySelectorAll<HTMLLabelElement>(".coding-task-panel label")].find((label) => label.textContent?.trim() === "Project name")?.querySelector<HTMLInputElement>("input"));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "new-coding-project"); name.dispatchEvent(new Event("input", { bubbles: true }));
  await click("Create project directory");
  await until(() => [...document.querySelectorAll<HTMLInputElement>(".coding-task-panel input")].some((input) => input.value.includes("new-coding-project")));
  await type("Prepare a fresh project"); await click("Preview initialization"); await until(() => document.querySelectorAll(".coding-task-panel input[type=checkbox]").length === 4);
  await click("Apply selected files");
  const newPath = useAppStore.getState().sessions.find((session) => session.id === useAppStore.getState().activeSessionId)!.projectPath!;
  await until(async () => (await api.listFreeTasks(newPath)).tasks.some((task) => task.action === "initialize" && task.phase === "completed"));
  await click("Close");
  const previousSession = useAppStore.getState().activeSessionId;
  await fixture("reset"); await fixture("releaseLaunch");
  await action("Review code"); await type("Fresh isolated review");
  const destination = await until(() => document.querySelector<HTMLSelectElement>(".coding-task-panel select"));
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(destination, "new");
  destination.dispatchEvent(new Event("change", { bubbles: true }));
  await click("Start");
  const isolated = await until(async () => (await api.listFreeTasks(newPath)).tasks.find((task) => task.action === "review" && task.phase === "running"));
  if (isolated.sessionId === previousSession || isolated.references.length !== 0) throw new Error("New conversation did not isolate selected context");
  await fixture("releaseProvider"); await until(async () => (await api.readFreeTask(isolated.id)).phase === "completed");
  const detail = await api.getSession(isolated.sessionId);
  if (detail.session?.messages.some((message) => message.content.includes("Prepare a fresh project"))) throw new Error("New conversation inherited unselected history");
  await fixture("setSkillEnabled", { id: "implement", path: projectPath, enabled: false });
  useAppStore.setState({ activeSessionId: sessionId, activeProjectPath: projectPath, workspace: { path: projectPath, name: "Project A" } });
  await action("Implement"); await click("Enable skill");
  await until(() => !document.querySelector(".coding-task-panel")?.textContent?.includes("This skill is missing or disabled"));
  await click("Close");
  await fixture("reset", "modelMissing"); await fixture("releaseLaunch");
  await action("Review code"); await type("Retain this draft during model setup"); await click("Start", false);
  await until(() => document.querySelector(".coding-task-panel [role=alert]")?.textContent?.includes("Model not configured"));
  await click("Configure model");
  if (useAppStore.getState().settingsTab !== "ai" || useAppStore.getState().page !== "settings") throw new Error("Model remediation did not open the matching settings");
  useAppStore.getState().setPage("chat");
  await action("Review code");
  const restored = await until(() => document.querySelector<HTMLTextAreaElement>(".coding-task-panel textarea"));
  if (restored.value !== "Retain this draft during model setup") throw new Error("Model remediation discarded the draft");
  await fixture("reset"); await fixture("releaseLaunch"); await click("Start");
  const recovered = await until(async () => (await api.listFreeTasks(projectPath)).tasks.find((task) => task.phase === "running"));
  await fixture("releaseProvider"); await until(async () => (await api.readFreeTask(recovered.id)).phase === "completed");
  const finalSkills = await fixture("snapshot") as { skillIds: string[] };
  return { ok: true, direct: true, handoff: true, initialization: true, skillIds: finalSkills.skillIds, waiting: true, cancellation: true, partialRetry: true, newProject: true, keyboard: true, narrow: true, newConversation: true, removableContext: true, remediation: true };
};
