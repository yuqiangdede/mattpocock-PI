import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function service(host, submit) {
  const source = await readFile(new URL("../electron/main/services/free-task-execution.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", compiled)(module.exports, module);
  return module.exports.createFreeTaskService({ getHost: () => host,
    catalog: async () => [{ kind: "skill", name: "implement", skillId: "implement" }],
    submit, cancel: async () => ({ aborted: true }) });
}

test("start direct implementation, read its result and hand off to another task", async () => {
  const tasks = new Map();
  const host = { call: async (method, input) => {
    if (method === "freeTask.reserve") {
      const task = { ...input, id: input.requestId, projectPath: "project", phase: "pending" };
      tasks.set(task.id, task); return task;
    }
    if (method === "freeTask.context") return { projectPath: "project", skillId: "implement", prompt: "/implement Add a title" };
    if (method === "freeTask.read") return tasks.get(input.id);
    throw new Error(`Unexpected boundary: ${method}`);
  } };
  const submitted = [];
  const api = await service(host, async (request) => { submitted.push(request); tasks.get(request.freeTaskId).phase = "completed"; return { accepted: true, turnId: "turn" }; });
  const task = await api.start({ requestId: "a", sessionId: "session", action: "implement", description: "Add a title", references: [] });
  assert.equal(submitted[0].freeTaskId, task.id);
  assert.equal(submitted[0].content, "/implement Add a title");
  assert.equal((await api.read(task.id)).phase, "completed");
});
