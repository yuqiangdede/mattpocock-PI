import { CodingActionRegistry, resolveCodingAction, type CodingActionConfiguration, type ComposerCommand } from "@pi-desktop/shared";
import { buildSkillShortcutDraft } from "../chat/composer/skill-shortcut-draft";
export class CodingActionContextError extends Error {
  readonly code: "sessionRequired" | "contextChanged";
  constructor(code: "sessionRequired" | "contextChanged", message: string) { super(message); this.code = code; }
}
export type CodingActionContext = {
  sessionId: string; projectPath: string; configuration: CodingActionConfiguration;
  catalog: () => Promise<ComposerCommand[]>; isCurrent: () => boolean;
  defaultPrompt: (skillId: string) => string;
  readLiveDraft: () => string;
  applyDraft: (text: string) => void;
};
// Selection prepares an ordinary editable slash draft; only Composer Send submits it.
export async function executeCodingAction(actionId: string, context: CodingActionContext): Promise<void> {
  const registry = new CodingActionRegistry(context.configuration);
  registry.get(actionId);
  const commands = await context.catalog();
  if (!context.isCurrent()) throw new CodingActionContextError("contextChanged", "项目或会话已切换，请重新选择 Action");
  const { action, command } = resolveCodingAction(actionId, registry, commands);
  const prompt = action.prompt ?? context.defaultPrompt(action.skillId);
  context.applyDraft(buildSkillShortcutDraft(command.name, prompt, context.readLiveDraft()));
}
