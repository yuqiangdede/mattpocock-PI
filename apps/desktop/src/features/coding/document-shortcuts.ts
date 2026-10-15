/** Application-owned document tools; user-defined skills keep their own IDs. */
export const DOCUMENT_SHORTCUTS = [
  { skillId: "pi-desktop:requirements-spec", labelKey: "requirementsSpec", helpKey: "requirementsSpec", promptKey: "requirementsSpec" },
  { skillId: "pi-desktop:overall-design", labelKey: "architectureDesign", helpKey: "overallDesign", promptKey: "overallDesign" },
  { skillId: "pi-desktop:outline-design", labelKey: "detailedDesign", helpKey: "outlineDesign", promptKey: "outlineDesign" },
  { skillId: "pi-desktop:api-integration-docs", labelKey: "apiSpec", helpKey: "apiIntegration", promptKey: "apiIntegration" },
  { skillId: "pi-desktop:database-design-doc", labelKey: "databaseDesign", helpKey: "databaseDesign", promptKey: "databaseDesign" },
  { skillId: "pi-desktop:component-doc-merge", labelKey: "mergeConvert", helpKey: "mergeConvert", promptKey: "mergeConvert" },
] as const;

export function documentPromptKey(skillId: string): string | undefined {
  const document = DOCUMENT_SHORTCUTS.find(item => item.skillId === skillId);
  return document ? `coding.prompts.${document.promptKey}` : undefined;
}
