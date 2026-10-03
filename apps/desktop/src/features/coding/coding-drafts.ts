import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FreeTaskAction } from "@pi-desktop/shared";
export type CodingDraft = {
  description: string; references: string; destination: "current" | "new";
  initializationMode?: "new" | "existing"; parentPath?: string; newName?: string; initializationSelected?: string[];
};
export const emptyCodingDraft: CodingDraft = { description: "", references: "", destination: "current" };
export const useCodingDrafts = create<{ drafts: Record<string, CodingDraft>; update: (key: string, draft: CodingDraft) => void }>()(persist((set) => ({
  drafts: {}, update: (key, draft) => set((state) => ({ drafts: { ...state.drafts, [key]: draft } })),
}), { name: "pi-desktop-coding-drafts", version: 1 }));
export function codingDraftKey(project: string, session: string, action: FreeTaskAction) { return JSON.stringify([project, session, action]); }
