import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { createWorkflowExecutionService } = await import("../electron/main/services/workflow-execution.ts");

test("historical workflow admission dispatches through the prefixed native Skill catalog", async () => {
  const context = { projectPath: "project", skillId: "grill-with-docs", prompt: "/grill-with-docs Keep the historical instruction" };
  const admission = { newReservation: true, execution: { id: "execution", sessionId: "session" } };
  const host = { call: async method => {
    if (method === "workflow.stage.check" || method === "workflow.execution.context") return context;
    if (method === "workflow.stage.reserve") return admission;
    throw new Error(`Unexpected host boundary: ${method}`);
  } };
  let finishSubmission;
  const submitted = new Promise(resolve => { finishSubmission = resolve; });
  let active = true;
  const service = createWorkflowExecutionService({
    getHost: () => host,
    catalog: async () => active ? [{ name: "skill:grill-with-docs", kind: "skill", skillId: "grill-with-docs", title: "Discuss requirements" }] : [],
    submit: async input => { finishSubmission(input); return { accepted: true, turnId: "turn" }; },
    cancel: async () => ({ aborted: true }), logger: { app() {} },
  });
  const input = { projectGroupId: "project", runId: "run", sessionId: "session", stageId: "discovery" };
  assert.deepEqual(await service.check(input), { ready: true, skillId: "grill-with-docs" });
  assert.equal(await service.start(input), admission);
  assert.deepEqual(await submitted, { sessionId: "session", content: context.prompt, workflowExecutionId: "execution" });
  active = false;
  assert.equal((await service.check(input)).ready, false);
  await assert.rejects(service.start(input), error => error.errorCode === "WORKFLOW_SKILL_UNAVAILABLE");
});
