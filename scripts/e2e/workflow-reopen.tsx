import { button, click, phase, snapshot, until, openWorkflow, create } from "./workflow-discovery";
import { api } from "../../apps/desktop/src/lib/api";

type Checkpoint = { runId: string; revision: number; stages: string; executions: string };
declare global { var workflowReopenProbe: () => Promise<Checkpoint>; var workflowReopenRestored: (checkpoint: Checkpoint) => Promise<unknown>; }

async function projectHistory() {
  const groups = (await api.listProjectGroups()).groups;
  return (await api.readWorkflowHistory(groups.find((group) => group.name === "Project A")!.id)).history;
}
const hostCall = (method: string, params: object) => window.workflowFixture.action("hostCall", { method, params });
async function refused(operation: () => Promise<unknown>) { try { await operation(); } catch { return; } throw new Error("Invalid reopening was admitted"); }
async function perform(label: string) {
  console.log("WORKFLOW_REOPEN_STEP", label);
  await window.workflowFixture.action("reset", "normal");
  await click(label);
  await phase("pending");
  await window.workflowFixture.action("releaseLaunch");
  await phase("running");
  await window.workflowFixture.action("releaseProvider");
  await phase("normal");
  console.log("WORKFLOW_REOPEN_STEP", label, "normal");
}
function affectedStages() { return [...document.querySelectorAll("dialog.workflow-reopen-dialog li")].map((node) => node.textContent); }

globalThis.workflowReopenProbe = async () => {
  console.log("WORKFLOW_REOPEN_STEP", "open");
  await openWorkflow();
  await create("Revision effort");
  for (const name of ["Discovery", "Spec", "Tickets", "Implement"]) {
    await perform(`Start ${name}`);
    await click(name === "Implement" ? "Confirm all tasks complete" : `Accept ${name}`);
    await until(async () => (await projectHistory()).runs[0].stages.find((stage) => stage.id === name.toLowerCase())?.status === "completed", `accept ${name}`);
  }
  const initial = await projectHistory();
  console.log("WORKFLOW_REOPEN_STEP", "cancel Spec dialog");
  await click("Reopen Spec");
  await until(() => document.querySelector("dialog[open]"), "reopening dialog");
  if (JSON.stringify(affectedStages()) !== JSON.stringify(["Spec", "Tickets", "Implement", "Review", "Retro"])) throw new Error("Incorrect reopening impact");
  await click("Cancel");
  await until(() => !document.querySelector("dialog[open]"), "cancelled dialog");
  if (JSON.stringify(initial) !== JSON.stringify(await projectHistory())) throw new Error("Cancel mutated the run");
  await click("Return to Implement");
  console.log("WORKFLOW_REOPEN_STEP", "return dialog");
  await until(() => document.querySelector("dialog[open]"), "return dialog");
  if (JSON.stringify(affectedStages()) !== JSON.stringify(["Implement", "Review", "Retro"])) throw new Error("Return to Implement affected predecessors");
  await click("Confirm reopening");
  console.log("WORKFLOW_REOPEN_STEP", "return confirmed");
  await until(async () => (await projectHistory()).runs[0].stages[3].revision === 2, "Implement new revision");
  await until(() => !document.querySelector("dialog[open]"), "confirmed dialog retired");
  const reopened = await projectHistory();
  const run = reopened.runs[0];
  if (!run.stages.slice(0, 3).every((stage) => stage.status === "completed" && stage.revision === 1) || run.stages[4].status !== "locked" || run.stages[5].status !== "locked") throw new Error("Return did not preserve accepted predecessors");
  await refused(() => api.acceptWorkflowStage({ projectGroupId: reopened.projectGroupId, runId: run.id, stageId: "implement", expectedRevision: reopened.revision }));
  await refused(() => api.reopenWorkflowStage({ projectGroupId: reopened.projectGroupId, runId: run.id, stageId: "spec", expectedRevision: initial.revision, confirmed: true }));
  await hostCall("session.endTurn", { turnId: initial.runs[0].executions[3].turnId, status: "error", errorCode: "DELAYED_OLD_EVENT", createNotification: false });
  if ((await projectHistory()).revision !== reopened.revision) throw new Error("Delayed old turn changed the current revision");
  await until(() => document.querySelector('[data-workflow-historical="true"]'), "historical execution marker");
  await perform("Start Implement");
  await click("Confirm all tasks complete");
  await until(async () => (await projectHistory()).runs[0].stages[3].status === "completed", "new Implement acceptance");
  await window.workflowFixture.action("reset", "normal");
  await click("Start Review");
  console.log("WORKFLOW_REOPEN_STEP", "Review pending");
  await phase("pending");
  const pending = await projectHistory();
  await refused(() => api.reopenWorkflowStage({ projectGroupId: pending.projectGroupId, runId: run.id, stageId: "spec", expectedRevision: pending.revision, confirmed: true }));
  if (!button("Reopen Spec")?.disabled) throw new Error("Pending work exposes reopening");
  await window.workflowFixture.action("releaseLaunch");
  await phase("running");
  await click("Stop");
  console.log("WORKFLOW_REOPEN_STEP", "Review stop requested");
  await phase("aborted");
  await perform("Retry");
  await click("Reopen Spec");
  await until(() => document.querySelector("dialog[open]"), "earlier stage dialog");
  await click("Confirm reopening");
  await until(async () => (await projectHistory()).runs[0].stages[1].revision === 2, "Spec new revision");
  const earlier = await projectHistory();
  console.log("WORKFLOW_REOPEN_STEP", "Spec reopened");
  console.log("WORKFLOW_REOPEN_STATE", JSON.stringify({ dialog: Boolean(document.querySelector("dialog[open]")), archiveDisabled: button("Archive run")?.disabled, text: document.body.innerText.slice(-700) }));
  await until(() => !document.querySelector("dialog[open]"), "earlier reopening dialog retired");
  if (earlier.runs[0].stages[0].status !== "completed" || earlier.runs[0].stages[1].status !== "ready" || !earlier.runs[0].stages.slice(2).every((stage) => stage.status === "locked" && !stage.acceptance)) throw new Error("Earlier reopening retained downstream acceptance");
  await click("Archive run");
  console.log("WORKFLOW_REOPEN_STEP", "archive requested");
  await until(async () => (await projectHistory()).runs[0].outcome === "archived", "archived revision effort");
  const archived = await projectHistory();
  await refused(() => api.reopenWorkflowStage({ projectGroupId: archived.projectGroupId, runId: run.id, stageId: "discovery", expectedRevision: archived.revision, confirmed: true }));
  await create("Next revision effort");
  console.log("WORKFLOW_REOPEN_STEP", "new effort created");
  const final = await projectHistory();
  return { runId: run.id, revision: final.revision, stages: JSON.stringify(final.runs[0].stages), executions: JSON.stringify(final.runs[0].executions) };
};

globalThis.workflowReopenRestored = async (checkpoint) => {
  console.log("WORKFLOW_REOPEN_STEP", "restored");
  await openWorkflow();
  const restored = await projectHistory();
  if (restored.revision !== checkpoint.revision || JSON.stringify(restored.runs[0].stages) !== checkpoint.stages || JSON.stringify(restored.runs[0].executions) !== checkpoint.executions) throw new Error("Restart changed revision history");
  (await until(() => [...document.querySelectorAll<HTMLButtonElement>('.workflow-history button')].find((node) => node.textContent?.trim().startsWith("Revision effort")), "retained revision effort")).click();
  await until(() => document.querySelector('[data-workflow-historical="true"]'), "restored historical attempts");
  if (button("Reopen Spec") || button("Return to Implement")) throw new Error("Archived history exposes reopening");
  return { ok: true, reopened: true, restartRetained: true, promptCount: (await snapshot()).prompts };
};
