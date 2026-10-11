import { resolveCodingPromptAction, type CodingActionConfiguration } from "@pi-desktop/shared";
import { buildCommitCodeDraft } from "./commit-code-draft";

export function preparePromptAction(id: string, options: {
  configuration: CodingActionConfiguration;
  commitPrompt: string;
  readLiveDraft: () => string;
  applyDraft: (text: string) => void;
}) {
  const { prompt } = resolveCodingPromptAction(options.configuration, id, options.commitPrompt);
  options.applyDraft(buildCommitCodeDraft(prompt, options.readLiveDraft()));
}
