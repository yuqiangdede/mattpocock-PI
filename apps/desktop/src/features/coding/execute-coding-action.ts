import { CodingActionRegistry, resolveCodingAction, serializeInlineComposerFileReferences, type CodingActionConfiguration, type ComposerCommand } from "@pi-desktop/shared";
import type { ComposerDraftSnapshot } from "../../lib/composer-smart-stop";
export type CodingActionContext = {
  sessionId: string; projectPath: string; configuration: CodingActionConfiguration;
  catalog: () => Promise<ComposerCommand[]>; isCurrent: () => boolean;
  draft?: ComposerDraftSnapshot;
  send: (content: string, draft: ComposerDraftSnapshot | undefined, sessionId: string) => Promise<boolean>;
};
// 扩展入口只做 Action → 原生 Skill 目录 → 原生会话提交；不定义流程或执行引擎。
export async function executeCodingAction(actionId: string, context: CodingActionContext): Promise<boolean> {
  if (!context.sessionId) throw new Error("请先打开一个会话");
  const registry = new CodingActionRegistry(context.configuration);
  registry.get(actionId);
  const commands = await context.catalog();
  if (!context.isCurrent()) throw new Error("项目或会话已切换，请重新选择 Action");
  const resolved = resolveCodingAction(actionId, registry, commands);
  const request = context.draft?.text ? serializeInlineComposerFileReferences(context.draft.text, context.draft.fileReferences) : "";
  return context.send(resolved.content + (request ? `\n\n${request}` : ""), context.draft, context.sessionId);
}
