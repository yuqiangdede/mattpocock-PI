import assert from "node:assert/strict";
import test from "node:test";
const { activateCodingShortcut } = await import("../src/features/coding/coding-shortcut-activation.ts");
const { skillGateMetadata } = await import("../src/features/coding/skill-gates.ts");

test("implement-spec opens the viewer while other configured and native skills keep their behavior", () => {
  const calls = [];
  const callbacks = { openTaskGraph: () => calls.push("viewer"), execute: id => calls.push(`execute:${id}`), selectSkill: id => calls.push(`skill:${id}`) };
  activateCodingShortcut({ action: { id: "custom-id", skillId: "implement-spec" }, configured: true }, callbacks);
  activateCodingShortcut({ action: { id: "review", skillId: "code-review" }, configured: true }, callbacks);
  activateCodingShortcut({ action: { id: "native", skillId: "tdd" }, configured: false }, callbacks);
  assert.deepEqual(calls, ["viewer", "execute:review", "skill:tdd"]);
});

test("key skill gates are descriptive metadata with CLI/Hook enforcement", () => {
  for (const id of ["implement", "implement-spec", "to-spec", "to-tickets", "code-review", "pr", "setup-pre-commit"]) {
    const gate = skillGateMetadata(id);
    assert.equal(gate.enforcement, "cli-permissions-or-hooks");
    assert.ok(gate.gates.length > 0);
  }
  assert.equal(skillGateMetadata("unknown-skill"), undefined);
  assert.equal(skillGateMetadata("implement-spec").entry, "task-graph-viewer");
});
