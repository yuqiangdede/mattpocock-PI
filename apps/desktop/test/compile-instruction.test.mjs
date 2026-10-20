import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { withCompileInstruction } = await import("../src/features/coding/compile-instruction.ts");

test("code-changing skills keep the independent compilation reminder", () => {
  for (const skillId of ["implement", "implement-spec", "diagnosing-bugs", "tdd", "prototype", "improve-codebase-architecture", "resolving-merge-conflicts"]) {
    assert.equal(withCompileInstruction("draft", "guard", { skillId }), "draft\n\nguard", skillId);
  }
});

test("discussion, review, documentation and unknown skills retain their own scope", () => {
  for (const skillId of ["setup-matt-pocock-skills", "grill-with-docs", "to-spec", "to-tickets", "code-review", "retro", "ask-matt", "pr", "grilling", "grill-with-ui", "handoff", "codebase-design", "domain-modeling", "research", "wizard", "writing-for-agents", "pi-desktop:requirements-spec", "custom-skill"]) {
    assert.equal(withCompileInstruction("draft", "guard", { skillId }), "draft", skillId);
  }
});

test("only commit and review repair plain actions receive the reminder", () => {
  for (const promptId of ["commit-code", "review-fix"]) {
    assert.equal(withCompileInstruction("draft", "guard", { promptId }), "draft\n\nguard");
  }
  for (const promptId of ["continue-task", "compile-project", "interaction-image", "custom-prompt"]) {
    assert.equal(withCompileInstruction("draft", "guard", { promptId }), "draft");
  }
});
