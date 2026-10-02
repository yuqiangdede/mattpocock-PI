import { createRoot } from "react-dom/client";
import i18n from "i18next";
import { I18nextProvider } from "react-i18next";
import { en } from "@pi-desktop/i18n";
import { api } from "../../apps/desktop/src/lib/api";
import { WorkPanel } from "../../apps/desktop/src/components/workpanel/WorkPanel";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { switchWorkPanelSession } from "../../apps/desktop/src/stores/slices/work-panel-slice";

declare global {
  interface Window { workflowFixture: { action(name: string, input?: unknown): Promise<unknown>; artifactAction(name: string, input?: unknown): Promise<unknown> } }
  var workflowDiscoveryProbe: () => Promise<unknown>;
  var workflowDiscoveryResume: (checkpoint: { executionId: string; turnId: string }) => Promise<unknown>;
  var workflowDiscoveryRecovered: (checkpoint: { executionId: string; turnId: string }) => Promise<unknown>;
}
const params = new URLSearchParams(location.search);
const projectA = params.get("projectA")!;
const projectB = params.get("projectB")!;
const sessionA = params.get("sessionId")!;
const sessionB = params.get("otherSessionId")!;
await i18n.init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false }, initImmediate: false });
useAppStore.setState({ activeSessionId: sessionA, activeProjectPath: projectA, workPanelTabs: [], activeWorkPanelTabId: null, workPanelContexts: {}, workPanelOpen: false });
useAppStore.getState().openWorkPanel();

function Fixture() {
  const open = useAppStore((state) => state.workPanelOpen);
  const select = (id: string, path: string) => {
    const state = useAppStore.getState();
    useAppStore.setState({ ...switchWorkPanelSession(state, id), activeSessionId: id, activeProjectPath: path });
    useAppStore.getState().openWorkPanel();
  };
  return <I18nextProvider i18n={i18n}>
    <nav className="fixture-controls">
      <button onClick={() => select(sessionA, projectA)}>Project A</button>
      <button onClick={() => select(sessionB, projectB)}>Project B</button>
      <button onClick={() => useAppStore.getState().toggleWorkPanel()}>Toggle panel</button>
    </nav>
    {open ? <WorkPanel containerWidth={1280} sidebarCollapsed sidebarWidth={0} /> : null}
  </I18nextProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

export async function until<T>(read: () => T | null | false | Promise<T | null | false>, label: string): Promise<T> {
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    const value = await read();
    if (value) return value;
    await new Promise<void>(requestAnimationFrame);
  }
  throw new Error(`Workflow Discovery fixture timed out: ${label}; ${document.body.innerText.slice(-1400)}`);
}
export function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === label) ?? null;
}
export async function click(label: string) { (await until(() => { const node = button(label); return node && !node.disabled ? node : null; }, label)).click(); }
export async function openWorkflow() {
  (await until(() => document.querySelector<HTMLButtonElement>('[data-work-panel-launcher-item="workflow"]'), "Workflow launcher")).click();
  await until(() => document.querySelector(".workflow-create"), "Workflow hydration");
}
export async function create(title: string) {
  const input = await until(() => {
    const node = document.querySelector<HTMLInputElement>('input[aria-label="Run title"]');
    return node && !node.disabled ? node : null;
  }, "available run title");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, title);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  (await until(() => { const node = button("Create run"); return node && !node.disabled ? node : null; }, "enabled Create run")).click();
  await until(() => button("Start Discovery") && !button("Start Discovery")!.disabled, "eligible Start Discovery");
}
export async function phase(value: string) {
  await until(() => document.querySelector(`[data-workflow-execution-phase="${value}"]`), value);
}
export function lockedSpec() {
  const row = [...document.querySelectorAll(".workflow-stages li")].find((node) => node.querySelector("strong")?.textContent === "Spec");
  if (row?.getAttribute("data-stage-status") !== "locked") throw new Error("Spec was unlocked by a turn outcome");
}
export async function latest() {
  const { histories } = await api.listWorkflowHistories();
  const history = histories.find((item) => item.projectName === "Project A")!;
  return history.runs.at(-1)!.executions.at(-1)!;
}
export async function snapshot() { return await window.workflowFixture.action("snapshot") as { prompts: number; skillLoads: number; transformed: string }; }

globalThis.workflowDiscoveryProbe = async () => {
  await openWorkflow();
  await create("First Discovery");
  const group = (await api.listProjectGroups()).groups.find((item) => item.name === "Project A")!;
  const run = (await api.readWorkflowHistory(group.id)).history.runs.at(-1)!;
  const missingSession = await api.checkWorkflowDiscovery({ projectGroupId: group.id, runId: run.id, sessionId: "" });
  const wrongProject = await api.checkWorkflowDiscovery({ projectGroupId: group.id, runId: run.id, sessionId: sessionB });
  if (missingSession.blocker?.code !== "WORKFLOW_SESSION_REQUIRED" || wrongProject.blocker?.code !== "WORKFLOW_PROJECT_MISMATCH") throw new Error("Admission blockers did not identify the session binding");
  await window.workflowFixture.action("disableSkill", { path: projectA, enabled: false });
  const disabledSkill = await api.checkWorkflowDiscovery({ projectGroupId: group.id, runId: run.id, sessionId: sessionA });
  if (disabledSkill.blocker?.code !== "WORKFLOW_SKILL_UNAVAILABLE") throw new Error("Registry metadata was mistaken for installed skill availability");
  await window.workflowFixture.action("disableSkill", { path: projectA, enabled: true });
  await window.workflowFixture.action("holdDispatch");
  await window.workflowFixture.action("releaseLaunch");
  const start = button("Start Discovery")!;
  start.click(); start.click();
  await phase("pending");
  lockedSpec();
  useAppStore.setState({ sessions: [{ id: sessionA, title: "Existing Workflow chat", mode: "agent", projectPath: projectA }] as ReturnType<typeof useAppStore.getState>["sessions"] });
  const ordinaryAccepted = await useAppStore.getState().sendPrompt("Ordinary composer input racing Discovery", undefined, sessionA);
  const queued = await api.listQueuedPrompts(sessionA);
  if (!ordinaryAccepted || queued.entries.length !== 1 || queued.entries[0].content !== "Ordinary composer input racing Discovery") throw new Error(`Ordinary composer input was lost during workflow reservation: ${JSON.stringify({ ordinaryAccepted, queued, messages: useAppStore.getState().messages, outcomes: useAppStore.getState().latestTurnResults, toasts: useAppStore.getState().toasts })}`);
  await window.workflowFixture.action("releaseDispatch");
  await window.workflowFixture.action("releaseLaunch");
  await phase("running");
  await until(async () => (await snapshot()).skillLoads === 1, "real Pi Skill loading");
  if (!(await snapshot()).transformed.includes("Call the `Skill` tool")) throw new Error("Workflow bypassed the existing skill prompt transformation");
  lockedSpec();
  await click("Project B");
  await openWorkflow();
  if (document.body.textContent?.includes("First Discovery")) throw new Error("Project A execution leaked into B");
  await click("Project A");
  await phase("running");
  await click("Toggle panel");
  await until(() => !document.querySelector('[data-testid="work-panel"]'), "closed running panel");
  await click("Toggle panel");
  await phase("running");
  const execution = await latest();
  if (!execution.turnId) throw new Error("Workflow did not retain the admitted host turn");
  return { executionId: execution.id, turnId: execution.turnId };
};

globalThis.workflowDiscoveryResume = async (checkpoint) => {
  await openWorkflow();
  await phase("running");
  const hydrated = await latest();
  if (hydrated.id !== checkpoint.executionId || hydrated.turnId !== checkpoint.turnId) throw new Error("Renderer reload changed execution identity");
  if ((await snapshot()).prompts !== 1) throw new Error("Renderer reload replayed a prompt");
  await window.workflowFixture.action("releaseProvider");
  await phase("normal");
  await until(async () => (await snapshot()).prompts === 2 && (await api.listQueuedPrompts(sessionA)).entries.length === 0, "ordinary queue resumed after Discovery");
  lockedSpec();
  const { histories } = await api.listWorkflowHistories();
  const first = histories.find((item) => item.projectName === "Project A")!.runs.at(-1)!;
  if (!first.stages[0].awaitingConfirmation) throw new Error("Normal execution did not await confirmation");
  await click("Archive run");
  await window.workflowFixture.action("reset", "failure");
  await create("Failed Discovery");
  await click("Start Discovery");
  await phase("pending");
  await window.workflowFixture.action("releaseLaunch");
  await phase("running");
  await until(async () => (await snapshot()).skillLoads === 3, "second real Skill loading");
  await window.workflowFixture.action("releaseProvider");
  await phase("failed");
  lockedSpec();
  await click("Archive run");
  await window.workflowFixture.action("reset", "uncertain");
  await create("Uncertain Discovery");
  await click("Start Discovery");
  await phase("pending");
  await window.workflowFixture.action("releaseLaunch");
  await until(async () => (await snapshot()).skillLoads === 4, "uncertain admitted execution");
  const uncertain = await until(async () => { const state = await latest(); return state.uncertainAdmission && state.turnId ? state : null; }, "uncertain admission reconciliation");
  if ((await snapshot()).prompts !== 4) throw new Error("Uncertain admission was resent");
  return { executionId: uncertain.id, turnId: uncertain.turnId };
};

globalThis.workflowDiscoveryRecovered = async (checkpoint) => {
  await openWorkflow();
  await phase("interrupted");
  lockedSpec();
  const recovered = await latest();
  const state = await snapshot();
  if (recovered.id !== checkpoint.executionId || recovered.turnId !== checkpoint.turnId || state.prompts !== 4) throw new Error("Restart lost identity or replayed uncertain work");
  return { ok: true, restartInterrupted: true, promptCount: state.prompts, skillLoads: state.skillLoads, specStayedLocked: true };
};

