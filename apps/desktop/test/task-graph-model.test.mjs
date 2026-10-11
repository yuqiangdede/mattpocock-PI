import assert from "node:assert/strict";
import test from "node:test";

const { inspectTaskGraph } = await import("../src/features/coding/task-graph-model.ts");

test("inspect a pasted graph and show only dependency-ready pending tasks", () => {
  const result = inspectTaskGraph(JSON.stringify({ tasks: [
    { id: "spec", title: "Agree scope", status: "done" },
    { id: "ui", title: "Implement viewer", status: "pending", blockedBy: ["spec"] },
    { id: "test", title: "Verify viewer", status: "pending", blockedBy: ["ui"] },
  ] }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.frontier, ["ui"]);
  assert.equal(result.tasks[2].blockedBy[0], "ui");
});

test("reject malformed, ambiguous or unsafe graphs before showing tasks", () => {
  for (const [input, error] of [
    ["{", "json"], ["null", "shape"], [JSON.stringify({ tasks: [{ id: "a", title: "A", status: "unknown" }] }), "shape"],
    [JSON.stringify({ tasks: [{ id: "a", title: "A", status: "pending", url: "javascript:alert(1)" }] }), "url"],
    [JSON.stringify({ tasks: [{ id: "a", title: "A", status: "pending" }, { id: "a", title: "B", status: "done" }] }), "duplicate"],
    [JSON.stringify({ tasks: [{ id: "a", title: "A", status: "pending", blockedBy: ["missing"] }] }), "dependency"],
    [JSON.stringify({ tasks: [{ id: "a", title: "A", status: "done", blockedBy: ["b"] }, { id: "b", title: "B", status: "pending", blockedBy: ["a"] }] }), "cycle"],
    [JSON.stringify({ tasks: [{ id: "a", title: "A", status: "pending", blockedBy: ["a"] }] }), "cycle"],
  ]) assert.deepEqual(inspectTaskGraph(input), { ok: false, error });
});

test("explicit null dependencies are rejected rather than made ready", () => {
  assert.deepEqual(inspectTaskGraph(JSON.stringify({ tasks: [{ id: "a", title: "A", status: "pending", blockedBy: null }] })), { ok: false, error: "shape" });
});
