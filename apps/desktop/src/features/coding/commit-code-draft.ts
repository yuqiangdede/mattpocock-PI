/** Prepare a plain editable prompt without a Skill command or submission. */
export function buildCommitCodeDraft(prompt: string, existingDraft: string): string {
  return prompt + (existingDraft ? "\n\n" + existingDraft : "");
}
