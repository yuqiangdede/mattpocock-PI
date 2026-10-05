export type RequirementsTarget = {
  projectGroupId: string;
  workspaceRoot: string;
  relativePath: string;
};

export type RequirementsConfirmation = Omit<RequirementsTarget, "projectGroupId"> & {
  id: string;
  contentHash: string;
  confirmedAt: number;
};

export type RequirementsHistory = {
  formatVersion: 1;
  projectGroupId: string;
  revision: number;
  confirmations: RequirementsConfirmation[];
};

export type RequirementsPreview = {
  target: RequirementsTarget;
  content: string;
  summary: string;
  contentHash: string;
  revision: number;
  latestConfirmation: RequirementsConfirmation | null;
  status: "confirmed" | "changed" | "unconfirmed";
};

export type RequirementsDecision = RequirementsTarget & {
  expectedRevision: number;
  contentHash: string;
};

export function validateRequirementsRequest(input: unknown, kind: "history" | "preview" | "confirm"): RequirementsTarget | RequirementsDecision | Pick<RequirementsTarget, "projectGroupId"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Requirements request object required");
  const fields = kind === "history" ? ["projectGroupId"] : kind === "confirm"
    ? ["projectGroupId", "workspaceRoot", "relativePath", "expectedRevision", "contentHash"]
    : ["projectGroupId", "workspaceRoot", "relativePath"];
  if (Object.keys(input).some(key => !fields.includes(key))) throw new Error("Unknown requirements request field");
  if (!("projectGroupId" in input) || typeof input.projectGroupId !== "string" || !input.projectGroupId.trim() || input.projectGroupId.length > 8192) throw new Error("Requirements project identity required");
  if (kind === "history") return { projectGroupId: input.projectGroupId };
  if (!("workspaceRoot" in input) || typeof input.workspaceRoot !== "string" || !input.workspaceRoot.trim() || input.workspaceRoot.length > 8192) throw new Error("Requirements workspace root required");
  if (!("relativePath" in input) || typeof input.relativePath !== "string" || !input.relativePath || input.relativePath.length > 8192 || /[\u0000-\u001f\u007f:]/.test(input.relativePath) || input.relativePath.split(/[\\/]/).some(part => !part || part === "." || part === "..")) throw new Error("Requirements root-relative path required");
  const target = { projectGroupId: input.projectGroupId, workspaceRoot: input.workspaceRoot, relativePath: input.relativePath };
  if (kind !== "confirm") return target;
  if (!("expectedRevision" in input) || typeof input.expectedRevision !== "number" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Requirements safe revision required");
  if (!("contentHash" in input) || typeof input.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.contentHash)) throw new Error("Requirements SHA256 content version required");
  return { ...target, expectedRevision: input.expectedRevision, contentHash: input.contentHash };
}
