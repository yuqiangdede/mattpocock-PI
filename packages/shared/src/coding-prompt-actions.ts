export type CodingPromptAction = {
  id: string;
  label: string;
  prompt: string | null;
  enabled?: boolean;
  order?: number;
};

export function validateCodingPromptActions(value: unknown): asserts value is CodingPromptAction[] {
  const fail = (): never => { throw new Error("Invalid plain prompt button configuration"); };
  if (!Array.isArray(value) || value.length > 256) fail();
  const ids = new Set<string>();
  for (const entry of value as CodingPromptAction[]) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).some(key => !["id", "label", "prompt", "enabled", "order"].includes(key))) fail();
    if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 128 || entry.id.includes("\0") || ids.has(entry.id)) fail();
    ids.add(entry.id);
    if (typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > 128 || entry.label.includes("\0")) fail();
    if (entry.prompt === null) { if (entry.id !== "commit-code") fail(); }
    else if (typeof entry.prompt !== "string" || !entry.prompt.trim() || entry.prompt.length > 16000 || entry.prompt.includes("\0")) fail();
    if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") fail();
    if (entry.order !== undefined && (!Number.isSafeInteger(entry.order) || entry.order < 0)) fail();
  }
}
