import { describe, expect, it } from "vitest";
import { normalizePiDuration, projectPiRunState, terminalPiPhase } from "./pi-run-state.js";

describe("Pi run projection", () => {
  it("keeps awaited terminal listeners busy until Pi settles", () => {
    expect(projectPiRunState(true, "completed").phase).toBe("running");
    expect(projectPiRunState(false, "completed").phase).toBe("completed");
  });
  it("preserves desktop work while the Pi request is idle", () => {
    expect(projectPiRunState(false, "completed", true).phase).toBe("running");
    expect(projectPiRunState(false, "aborted", false, "host-turn")).toEqual({ phase: "aborted", turnId: "host-turn" });
  });
  it("starts idle without claiming a completed request", () => {
    expect(projectPiRunState(false).phase).toBe("idle");
  });
  it("classifies structured aborts and failures without message parsing", () => {
    expect(terminalPiPhase("aborted")).toBe("aborted");
    expect(terminalPiPhase("error", "AbortError")).toBe("aborted");
    expect(terminalPiPhase("error")).toBe("error");
    expect(terminalPiPhase("toolUse")).toBe("completed");
  });
  it("uses monotonic Pi duration including zero and guards invalid fallback", () => {
    expect(normalizePiDuration(0, 20)).toBe(0);
    expect(normalizePiDuration(47, 20)).toBe(47);
    for (const invalid of [undefined, -1, NaN, Infinity]) expect(normalizePiDuration(invalid, 20)).toBe(20);
    expect(normalizePiDuration(undefined, -1)).toBeUndefined();
  });
});
