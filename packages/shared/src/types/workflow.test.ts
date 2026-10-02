import { describe, expect, it } from "vitest";
import { WORKFLOW_STAGES, showEngineeringSkillEntry } from "./workflow.js";

describe("Workflow stage contract", () => {
  it("shows six default entries while search and show-all retain auxiliary skill discovery", () => {
    const catalog = [...WORKFLOW_STAGES.map((stage) => stage.skillId), "tdd", "grilling", "custom-skill"];
    expect(catalog.filter((id) => showEngineeringSkillEntry(id))).toHaveLength(6);
    expect(showEngineeringSkillEntry("tdd", "tdd")).toBe(true);
    expect(showEngineeringSkillEntry("grilling", "", true)).toBe(true);
  });
  it("defines exactly the six engineering stage/installed-skill pairs", () => {
    expect(WORKFLOW_STAGES.map((stage) => [stage.id, stage.skillId])).toEqual([
      ["discovery", "grill-with-docs"], ["spec", "to-spec"], ["tickets", "to-tickets"],
      ["implement", "implement"], ["review", "code-review"], ["retro", "retro"],
    ]);
  });
});
