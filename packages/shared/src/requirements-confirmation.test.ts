import { describe, expect, it } from "vitest";
import { validateRequirementsRequest } from "./requirements-confirmation.js";
import { IPC, IPC_WHITELIST } from "./protocol.js";

const target = { projectGroupId: "project-a", workspaceRoot: "C:/project", relativePath: "docs/spec.md" };

describe("requirements confirmation boundary", () => {
  it("accepts preview and content-version decisions without a Workflow identity", () => {
    expect(validateRequirementsRequest(target, "preview")).toEqual(target);
    const decision = { ...target, expectedRevision: 0, contentHash: "a".repeat(64) };
    expect(validateRequirementsRequest(decision, "confirm")).toEqual(decision);
    expect(IPC_WHITELIST.has(IPC.invoke.requirementsConfirm)).toBe(true);
  });
  it("rejects traversal, forged versions, unsafe revisions and unrequested fields", () => {
    for (const relativePath of ["../spec.md", "/spec.md", "C:/spec.md", "docs//spec.md", "./spec.md", "spec\u0000.md"]) {
      expect(() => validateRequirementsRequest({ ...target, relativePath }, "preview")).toThrow();
    }
    for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateRequirementsRequest({ ...target, expectedRevision, contentHash: "a".repeat(64) }, "confirm")).toThrow();
    }
    expect(() => validateRequirementsRequest({ ...target, expectedRevision: 0, contentHash: "unknown" }, "confirm")).toThrow();
    expect(() => validateRequirementsRequest({ ...target, acceptStage: true }, "preview")).toThrow();
    expect(() => validateRequirementsRequest(null, "history")).toThrow();
  });
});
