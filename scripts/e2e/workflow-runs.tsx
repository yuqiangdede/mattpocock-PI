import { createRoot } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { en } from "@pi-desktop/i18n";
import { api } from "../../apps/desktop/src/lib/api";
import { WorkPanel } from "../../apps/desktop/src/components/workpanel/WorkPanel";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { switchWorkPanelSession } from "../../apps/desktop/src/stores/slices/work-panel-slice";

declare global {
  var workflowRunsProbe: () => Promise<unknown>;
  interface Window {
    workflowFixture: {
      pauseNextRead: () => Promise<void>;
      waitForReadStart: () => Promise<void>;
      releaseRead: () => Promise<void>;
      waitForReadFinish: () => Promise<void>;
    };
  }
}

const projectPaths = {
  projectA: new URLSearchParams(window.location.search).get("projectA") ?? "",
  projectB: new URLSearchParams(window.location.search).get("projectB") ?? "",
};
if (!projectPaths.projectA || !projectPaths.projectB) {
  throw new Error("workflow fixture project paths are required");
}

const i18n = createInstance();
await i18n.init({ lng: "en", resources: { en: { translation: en } }, initImmediate: false });
useAppStore.setState({
  activeSessionId: "a-first-chat",
  activeProjectPath: projectPaths.projectA,
  workPanelOpen: false,
  workPanelTabs: [],
  activeWorkPanelTabId: null,
  workPanelContexts: {},
});
useAppStore.getState().openWorkPanel();

function WorkflowFixture() {
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const activeProjectPath = useAppStore((state) => state.activeProjectPath);
  const workPanelOpen = useAppStore((state) => state.workPanelOpen);
  const switchSession = (sessionId: string, projectPath: string) => {
    const current = useAppStore.getState();
    const next = switchWorkPanelSession(current, sessionId);
    useAppStore.setState({
      ...next,
      activeSessionId: sessionId,
      activeProjectPath: projectPath,
    });
    useAppStore.getState().openWorkPanel();
  };
  return (
    <I18nextProvider i18n={i18n}>
      <nav className="fixture-controls" aria-label="Workflow fixture navigation">
        <button onClick={() => switchSession("a-first-chat", projectPaths.projectA)}>Project A</button>
        <button onClick={() => switchSession("b-chat", projectPaths.projectB)}>Project B</button>
        <button onClick={() => switchSession(activeSessionId === "a-first-chat" ? "a-second-chat" : "a-first-chat", projectPaths.projectA)}>Switch chat</button>
        <button onClick={() => {
          const store = useAppStore.getState();
          if (store.workPanelOpen) store.collapseWorkPanel();
          else store.openWorkPanel();
        }}>Toggle work panel</button>
        <span data-testid="active-project">{activeProjectPath}</span>
      </nav>
      {workPanelOpen ? (
        <WorkPanel
          containerWidth={1280}
          sidebarCollapsed
          sidebarWidth={0}
        />
      ) : null}
    </I18nextProvider>
  );
}

createRoot(document.getElementById("root")!).render(<WorkflowFixture />);

async function until<T>(read: () => T | null | false, label: string): Promise<T> {
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise<void>(requestAnimationFrame);
  }
  throw new Error(`Timed out: ${label}`);
}

function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim().startsWith(label),
  ) ?? null;
}

async function click(label: string) {
  (await until(() => button(label), label)).click();
}

async function openWorkflowTab() {
  const launcher = await until(
    () => document.querySelector<HTMLButtonElement>('[data-work-panel-launcher-item="workflow"]'),
    "native Workflow launcher row",
  );
  launcher.click();
  await until(() => document.querySelector("[data-testid=workflow-tab]"), "native Workflow tab");
}

async function waitForRuns(count: number, projectId: string) {
  await until(() => {
    const rows = document.querySelectorAll(".workflow-run-choice");
    return rows.length === count && document.querySelector("[data-testid=workflow-tab]")
      ? true
      : null;
  }, `${projectId} has ${count} runs`);
}

async function waitForProject(name: string) {
  await until(() =>
    document.body.textContent?.includes(`Project: ${name}`)
      && document.querySelector(".workflow-create")
      ? true
      : null,
  `loaded ${name}`);
}

globalThis.workflowRunsProbe = async () => {
  await until(() => document.querySelector("[data-testid=work-panel]"), "native Work Panel");
  let history = await api.listWorkflowHistories();
  if (history.histories.length !== 0) throw new Error("opening the project created a run");

  await click("Toggle work panel");
  await until(() => !document.querySelector("[data-testid=work-panel]"), "closed panel");
  history = await api.listWorkflowHistories();
  if (history.histories.length !== 0) throw new Error("closing the panel created a run");
  await click("Toggle work panel");
  await until(() => document.querySelector("[data-testid=work-panel]"), "reopened panel");
  await openWorkflowTab();
  await waitForProject("Project A");

  const titleInput = await until(
    () => document.querySelector<HTMLInputElement>("input[aria-label='Run title']"),
    "run title input",
  );
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setValue.call(titleInput, "First project effort");
  titleInput.dispatchEvent(new Event("input", { bubbles: true }));
  await click("Create run");
  await waitForRuns(1, "project A");
  await until(() => document.querySelector('[data-stage-status="ready"] strong')?.textContent === "Discovery", "Discovery ready");
  const lockedStages = [...document.querySelectorAll('[data-stage-status="locked"]')];
  if (lockedStages.length !== 5 || lockedStages.some((item) => !item.textContent?.includes("Locked"))) {
    throw new Error("new run did not lock all five downstream stages");
  }
  if (document.querySelector("button[data-workflow-stage-action]")) {
    throw new Error("an unimplemented workflow stage action was enabled");
  }

  await click("Switch chat");
  await openWorkflowTab();
  await waitForProject("Project A");
  await waitForRuns(1, "project A's second chat");
  await click("Project B");
  await openWorkflowTab();
  await waitForProject("Project B");
  await waitForRuns(0, "project B");
  if (document.body.textContent?.includes("First project effort")) {
    throw new Error("project B displayed project A's run");
  }
  await click("Project A");
  await waitForProject("Project A");
  await waitForRuns(1, "project A after returning from B");
  await click("Archive run");
  await until(() => document.body.textContent?.includes("Archived"), "archived run");

  const secondTitle = await until(
    () => document.querySelector<HTMLInputElement>("input[aria-label='Run title']"),
    "second run title input",
  );
  setValue.call(secondTitle, "Second project effort");
  secondTitle.dispatchEvent(new Event("input", { bubbles: true }));
  await click("Create run");
  await waitForRuns(2, "retained project A history");
  history = await api.listWorkflowHistories();
  const aHistory = history.histories.find((item) => item.projectName === "Project A");
  if (
    !aHistory
    || aHistory.runs.length !== 2
    || aHistory.runs[0]?.outcome !== "archived"
    || aHistory.runs[1]?.title !== "Second project effort"
  ) {
    throw new Error("host did not retain and separate project A's runs");
  }

  await click("Switch chat");
  await waitForRuns(2, "project A's other chat after archival");
  const selectedRun = button("First project effort");
  if (!selectedRun) throw new Error("archived run was not selectable");
  await window.workflowFixture.pauseNextRead();
  selectedRun.click();
  await window.workflowFixture.waitForReadStart();
  await click("Project B");
  await waitForProject("Project B");
  await waitForRuns(0, "project B while the old project read is in flight");
  await window.workflowFixture.releaseRead();
  await window.workflowFixture.waitForReadFinish();
  await new Promise<void>(requestAnimationFrame);
  if (document.body.textContent?.includes("First project effort")) {
    throw new Error("a delayed project A read replaced project B's history");
  }
  await click("Project A");
  await waitForProject("Project A");
  await waitForRuns(2, "project A after the stale read");

  useAppStore.getState().archiveProject(projectPaths.projectA);
  await until(
    () => document.querySelector(".workflow-unavailable")
      && !document.querySelector(".workflow-create")
      ? true
      : null,
    "renderer-archived project history",
  );
  await click("First project effort");
  await until(
    () => document.querySelector(".workflow-run")?.textContent?.includes("First project effort"),
    "read-only renderer-archived run details",
  );
  const archivedBindingReadOnly = !button("Archive run") && !document.querySelector(".workflow-create");
  useAppStore.getState().restoreProject(projectPaths.projectA);
  await until(() => document.querySelector(".workflow-create"), "restored project workflow actions");

  const closeWorkflow = await until(
    () => document.querySelector<HTMLButtonElement>(".work-panel-tab-close"),
    "native Workflow tab close control",
  );
  closeWorkflow.click();
  await until(
    () => document.querySelector("[data-testid=work-panel-empty]"),
    `closed Workflow tab; tabs=${document.querySelectorAll('[role="tab"]').length}`,
  );
  await openWorkflowTab();
  await waitForRuns(2, "reopened Workflow tab");

  await click("Toggle work panel");
  await until(() => !document.querySelector("[data-testid=work-panel]"), "closed work panel");
  await click("Toggle work panel");
  await until(() => document.querySelector("[data-testid=work-panel]"), "reopened work panel");
  await waitForRuns(2, "reopened panel history");

  await api.removeProject(projectPaths.projectA);
  await click("Refresh");
  await until(() =>
    document.querySelector(".workflow-unavailable")
      && !document.querySelector(".workflow-create")
      ? true
      : null,
  "unavailable project history after project removal");
  await click("First project effort");
  await until(
    () => document.querySelector(".workflow-run")?.textContent?.includes("First project effort"),
    "read-only unavailable run details",
  );
  history = await api.listWorkflowHistories();
  const retainedA = history.histories.find((item) => item.projectGroupId === aHistory.projectGroupId);
  if (!retainedA || retainedA.available || retainedA.runs.length !== 2) {
    throw new Error("removed project binding lost or moved its workflow history");
  }

  return {
    ok: true,
    projectAId: retainedA.projectGroupId,
    projectAAvailableAfterRemoval: retainedA.available,
    projectARuns: retainedA.runs.map((run) => ({ title: run.title, outcome: run.outcome })),
    projectBHasNoRun: !history.histories.some((item) => item.projectName === "Project B" && item.runs.length > 0),
    discoveryOnly: lockedStages.length === 5,
    archivedBindingReadOnly,
  };
};
