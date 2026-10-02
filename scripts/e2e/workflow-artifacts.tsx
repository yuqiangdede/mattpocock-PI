import { button, click, phase, until, openWorkflow, create } from "./workflow-discovery";
import { api } from "../../apps/desktop/src/lib/api";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import type { WorkflowArtifactRegistration } from "@pi-desktop/shared";

type Checkpoint = { groupId: string; runId: string; referenceId: string };
declare global { var workflowArtifactsProbe: () => Promise<Checkpoint>; var workflowArtifactsRestored: (checkpoint: Checkpoint) => Promise<unknown>; }
const params = new URLSearchParams(location.search);
const projectA = params.get("projectA")!;
const projectB = params.get("projectB")!;

function field(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`.workflow-artifact-form input[aria-label="${label}"]`);
  if (!input) throw new Error(`Artifact field missing: ${label}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
async function workflowTab() {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((node) => node.textContent?.trim() === "Workflow");
  if (tab) { tab.click(); await until(() => document.querySelector(".workflow-artifacts"), "artifact panel"); }
  else await openWorkflow();
}
async function refreshReferences() {
  document.querySelector<HTMLButtonElement>('.workflow-artifacts .workflow-run-heading button')!.click();
}
async function refused(operation: () => Promise<unknown>) { try { await operation(); } catch { return; } throw new Error("Unsafe reference operation was admitted"); }

globalThis.workflowArtifactsProbe = async () => {
  await window.workflowFixture.artifactAction("setWorkspace", projectA);
  await openWorkflow();
  await create("Artifact effort");
  const group = (await api.listProjectGroups()).groups.find((group) => group.name === "Project A")!;
  const read = async () => (await api.readWorkflowHistory(group.id)).history;
  const initial = await read();
  const run = initial.runs[0];
  field("Root-relative path", "docs/glossary.md");
  await until(() => button("Register reference") && !button("Register reference")!.disabled, "register enabled");
  await click("Register reference");
  await until(() => document.querySelector('[data-artifact-availability="available"]'), "registered available reference");
  const registered = await read();
  if (registered.runs[0].executions.length || registered.runs[0].stages.some((stage) => stage.acceptance)) throw new Error("Reference registration started or accepted workflow work");
  const reference = registered.runs[0].artifactReferences[0];
  console.log("WORKFLOW_ARTIFACTS_STEP", "registered");
  const open = await until(() => document.querySelector<HTMLButtonElement>('[aria-label="Open docs/glossary.md"]'), "open reference action");
  open.click();
  await until(() => document.querySelector(".file-viewer-markdown")?.textContent?.includes("A Workflow Project is a logical project group."), "existing file preview");
  console.log("WORKFLOW_ARTIFACTS_STEP", "previewed");
  if ((await read()).revision !== registered.revision) throw new Error("Opening changed stage acceptance or workflow revision");
  await workflowTab();
  await window.workflowFixture.artifactAction("pauseOpen");
  document.querySelector<HTMLButtonElement>('[aria-label="Open docs/glossary.md"]')!.click();
  await window.workflowFixture.artifactAction("waitOpen");
  await window.workflowFixture.artifactAction("setWorkspace", projectB);
  await click("Project B");
  await openWorkflow();
  await window.workflowFixture.artifactAction("releaseOpen");
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (document.querySelector(".file-viewer-markdown")) throw new Error("Late opening changed the destination project's panel");
  if (document.body.innerText.includes("docs/glossary.md")) throw new Error("A reference leaked into B");
  await window.workflowFixture.artifactAction("setWorkspace", projectA);
  await click("Project A");
  await workflowTab();
  await until(() => document.querySelector('[data-artifact-availability="available"]'), "A reference restored");
  const base: WorkflowArtifactRegistration = { projectGroupId: group.id, runId: run.id, stageId: "discovery", stageRevision: 1, kind: "glossary", workspaceRoot: group.roots[0].path, relativePath: "missing.md", ticketId: null, expectedRevision: registered.revision };
  for (const relativePath of ["../outside.md", projectB + "/outside.md", "escape/outside.md"]) await refused(() => api.registerWorkflowArtifact({ ...base, relativePath }));
  await refused(() => api.registerWorkflowArtifact({ ...base, workspaceRoot: projectB }));
  await refused(() => api.registerWorkflowArtifact({ ...base, expectedRevision: initial.revision }));
  await refused(() => api.registerWorkflowArtifact({ ...base, kind: "unknown" as WorkflowArtifactRegistration["kind"] }));
  if ((await read()).revision !== registered.revision) throw new Error("Rejected registration mutated history");
  await click("Start Discovery");
  await phase("pending");
  await window.workflowFixture.action("releaseLaunch");
  await phase("running");
  await window.workflowFixture.action("releaseProvider");
  await phase("normal");
  await click("Accept Discovery");
  await until(async () => (await read()).runs[0].stages[0].status === "completed", "Discovery accepted");
  await click("Reopen Discovery");
  await until(() => document.querySelector("dialog[open]"), "reopen dialog");
  await click("Confirm reopening");
  console.log("WORKFLOW_ARTIFACTS_STEP", "reopened");
  await until(() => document.querySelector('.workflow-artifact-list')?.textContent?.includes("Historical"), "historical reference presentation");
  await until(() => !document.querySelector("dialog[open]"), "closed reopen dialog");
  await window.workflowFixture.artifactAction("removeFile");
  console.log("WORKFLOW_ARTIFACTS_STEP", "removed file");
  await refreshReferences();
  await until(() => document.querySelector('[data-artifact-availability="missing"]'), "missing file retained");
  await window.workflowFixture.artifactAction("detachRoot");
  await refreshReferences();
  await until(() => document.querySelector('[data-artifact-availability="rootUnavailable"]'), "unavailable root retained");
  if (!document.querySelector<HTMLButtonElement>('[aria-label="Open docs/glossary.md"]')?.disabled) throw new Error("Unavailable reference remains openable");
  const after = await read();
  if (after.runs[0].artifactReferences.length !== 1 || after.runs[0].artifactReferences[0].id !== reference.id) throw new Error("Unavailable reference was removed or fabricated");
  return { groupId: group.id, runId: run.id, referenceId: reference.id };
};

globalThis.workflowArtifactsRestored = async (checkpoint) => {
  console.log("WORKFLOW_ARTIFACTS_STEP", "restored");
  // A physically unavailable root keeps its registered identity and history.
  const history = (await api.readWorkflowHistory(checkpoint.groupId)).history;
  const groups = (await api.listProjectGroups()).groups;
  const group = groups.find((group) => group.id === checkpoint.groupId)!;
  useAppStore.setState({ activeProjectPath: group.primaryPath });
  await openWorkflow();
  await until(() => document.querySelector('.workflow-artifacts'), "retained artifact panel after restart");
  await until(() => document.querySelector('[data-artifact-availability="rootUnavailable"]'), "retained unavailable root after restart");
  if (history.runs[0].artifactReferences[0].id !== checkpoint.referenceId || history.runs[0].artifactReferences[0].stageRevision !== 1) throw new Error("Restart lost reference identity/revision");
  await api.archiveWorkflowRun(checkpoint.groupId, checkpoint.runId, history.revision);
  const archived = (await api.readWorkflowHistory(checkpoint.groupId)).history;
  await refused(() => api.registerWorkflowArtifact({ projectGroupId: checkpoint.groupId, runId: checkpoint.runId, stageId: "discovery", stageRevision: 2, kind: "glossary", workspaceRoot: group.primaryPath, relativePath: "missing.md", ticketId: null, expectedRevision: archived.revision }));
  return { ok: true, registeredBeforeExecution: true, previewed: true, persisted: true, unavailableRetained: true };
};
