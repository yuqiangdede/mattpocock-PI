import { button, click, phase, snapshot, until, openWorkflow, create } from "./workflow-discovery";
import { api } from "../../apps/desktop/src/lib/api";
import { WORKFLOW_STAGES } from "@pi-desktop/shared";

declare global { var workflowStagesProbe: () => Promise<unknown>; }

globalThis.workflowStagesProbe = async () => {
  await openWorkflow();
  await create("Complete engineering effort /implement note");
  const group = (await api.listProjectGroups()).groups.find((item) => item.name === "Project A")!;
  const sessionId = new URLSearchParams(location.search).get("sessionId")!;
  const history = async () => (await api.readWorkflowHistory(group.id)).history;
  const run = async () => (await history()).runs[0];
  const hostCall = (method: string, params: object) => window.workflowFixture.action("hostCall", { method, params });
  const refused = async (operation: () => Promise<unknown>) => { try { await operation(); } catch { return; } throw new Error("Invalid workflow transition was admitted"); };
  const ordinary = await hostCall("session.beginTurn", { sessionId }) as { turnId: string };
  await hostCall("session.endTurn", { turnId: ordinary.turnId, status: "completed", createNotification: false });
  await refused(async () => api.acceptWorkflowStage({ projectGroupId: group.id, runId: (await run()).id, stageId: "discovery", expectedRevision: (await history()).revision }));
  const perform = async (label: string, mode = "normal") => {
    await window.workflowFixture.action("reset", mode);
    await click(label);
    await phase("pending");
    await window.workflowFixture.action("releaseLaunch");
    await phase("running");
    await window.workflowFixture.action("releaseProvider");
    await phase(mode === "failure" ? "failed" : "normal");
  };
  for (const [index, definition] of WORKFLOW_STAGES.entries()) {
    for (const successor of WORKFLOW_STAGES.slice(index + 1)) {
      await refused(async () => hostCall("workflow.stage.reserve", { projectGroupId: group.id, runId: (await run()).id, sessionId, stageId: successor.id, requestId: crypto.randomUUID(), expectedRevision: (await history()).revision }));
    }
    const label = definition.id[0].toUpperCase() + definition.id.slice(1);
    await perform(`Start ${label}`);
    if (!(await snapshot()).transformed.split("\n")[0].includes(`in order: "${definition.skillId}". Follow`)) throw new Error("A run title injected another workflow skill invocation");
    if (index < 5 && (await run()).stages[index + 1].status !== "locked") throw new Error("A normal turn unlocked its successor");
    if (definition.id === "discovery") {
      const active = await hostCall("session.beginTurn", { sessionId }) as { turnId: string };
      await refused(async () => api.acceptWorkflowStage({ projectGroupId: group.id, runId: (await run()).id, stageId: definition.id, expectedRevision: (await history()).revision }));
      await hostCall("session.endTurn", { turnId: active.turnId, status: "completed", createNotification: false });
      const queued = await hostCall("session.queuePush", { sessionId, principal: "desktop", inputHash: "acceptance-fixture", content: "Queued ordinary", permissionMode: "ask" }) as { entry: { id: string } };
      await refused(async () => api.acceptWorkflowStage({ projectGroupId: group.id, runId: (await run()).id, stageId: definition.id, expectedRevision: (await history()).revision }));
      await hostCall("session.queueRemove", { id: queued.entry.id });
    }
    if (definition.id === "spec") {
      await perform("Continue", "failure");
      await refused(async () => api.acceptWorkflowStage({ projectGroupId: group.id, runId: (await run()).id, stageId: definition.id, expectedRevision: (await history()).revision }));
      if (button("Accept Spec")) throw new Error("Failed continuation retained its acceptance control");
      await perform("Retry");
    }
    if (definition.id === "implement") await perform("Continue");
    await refused(async () => api.acceptWorkflowStage({ projectGroupId: group.id, runId: (await run()).id, stageId: definition.id, expectedRevision: (await history()).revision - 1 }));
    const before = await snapshot();
    await click(definition.id === "review" ? "Confirm review passed" : definition.id === "implement" ? "Confirm all tasks complete" : `Accept ${label}`);
    await until(async () => (await run()).stages[index].status === "completed", `accepted ${label}`);
    if ((await snapshot()).prompts !== before.prompts) throw new Error("Acceptance automatically dispatched Pi");
  }
  await until(async () => (await run()).outcome === "done", "read-only done history");
  if (button("Continue") || button("Archive run") || button("Confirm review passed")) throw new Error("Done history exposes mutation controls");
  await refused(async () => hostCall("workflow.stage.reserve", { projectGroupId: group.id, runId: (await run()).id, sessionId, stageId: "retro", requestId: crypto.randomUUID(), expectedRevision: (await history()).revision }));
  await create("New engineering effort");
  const result = await window.workflowFixture.action("snapshot") as { prompts: number; skillIds: string[] };
  const expected = ["grill-with-docs", "to-spec", "to-spec", "to-spec", "to-tickets", "implement", "implement", "code-review", "retro"];
  if (JSON.stringify(result.skillIds) !== JSON.stringify(expected)) throw new Error(`Wrong stage/skill dispatch: ${JSON.stringify(result.skillIds)}`);
  return { ok: true, completed: true, promptCount: result.prompts, skillIds: result.skillIds, doneAndNewRun: (await history()).runs.length === 2 };
};
