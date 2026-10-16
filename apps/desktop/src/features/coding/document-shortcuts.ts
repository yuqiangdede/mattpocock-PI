/** Application-owned document tools; user-defined skills keep their own IDs. */
export const DOCUMENT_SHORTCUTS = [
  { skillId: "pi-desktop:requirements-spec", labelKey: "requirementsSpec", helpKey: "requirementsSpec", promptKey: "requirementsSpec" },
  { skillId: "pi-desktop:overall-design", labelKey: "architectureDesign", helpKey: "overallDesign", promptKey: "overallDesign" },
  { skillId: "pi-desktop:outline-design", labelKey: "detailedDesign", helpKey: "outlineDesign", promptKey: "outlineDesign" },
  { skillId: "pi-desktop:api-integration-docs", labelKey: "apiSpec", helpKey: "apiIntegration", promptKey: "apiIntegration" },
  { skillId: "pi-desktop:database-design-doc", labelKey: "databaseDesign", helpKey: "databaseDesign", promptKey: "databaseDesign" },
  { skillId: "pi-desktop:component-doc-merge", labelKey: "mergeConvert", helpKey: "mergeConvert", promptKey: "mergeConvert" },
] as const;

export function findDocumentShortcut(skillId: string) {
  const document = DOCUMENT_SHORTCUTS.find(item => item.skillId === skillId || item.skillId === `pi-desktop:${skillId}` || item.skillId.replace(/^pi-desktop:/, "") === skillId);
  if (document) return document;
  if (skillId === "pi-desktop:markdown-to-docx" || skillId === "markdown-to-docx") {
    return { skillId: "pi-desktop:markdown-to-docx", labelKey: "markdownToDocx", helpKey: "markdownToDocx", promptKey: "markdownToDocx" } as const;
  }
  return undefined;
}

export function documentPromptKey(skillId: string): string | undefined {
  const document = findDocumentShortcut(skillId);
  if (document) return `coding.prompts.${document.promptKey}`;
  return undefined;
}
