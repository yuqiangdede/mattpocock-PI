import type { ShortcutBinding } from "./skill-shortcuts";
import type { ComposerCommand } from "./types/composer";

export const QUALIFIED_SKILL_PREFIX = "ext-skill/";
const safeId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value) && !value.split("/").some(part => !part || part === "." || part === "..");
export function isShortcutBinding(value: unknown): value is ShortcutBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as ShortcutBinding;
  if (!safeId(binding.skillId) || binding.skillId.startsWith(QUALIFIED_SKILL_PREFIX)) return false;
  if (binding.source === undefined) return binding.sourceId === undefined;
  if (binding.source === "builtin") return binding.sourceId === undefined;
  if (binding.source === "user") return binding.sourceId === "global" || binding.sourceId === "project";
  return binding.source === "plugin" && safeId(binding.sourceId) && !binding.sourceId.includes("/") && binding.skillId.startsWith(`${binding.sourceId}/`);
}
export function qualifiedSkillId(binding: ShortcutBinding): string {
  if (!isShortcutBinding(binding) || !binding.source) throw new Error("Skill 来源绑定无效");
  return `${QUALIFIED_SKILL_PREFIX}${binding.source}/${encodeURIComponent(binding.sourceId ?? "-")}/${encodeURIComponent(binding.skillId)}`;
}
export function parseQualifiedSkillId(id: string): ShortcutBinding | null {
  if (!id.startsWith(QUALIFIED_SKILL_PREFIX)) return null;
  try {
    const parts = id.slice(QUALIFIED_SKILL_PREFIX.length).split("/");
    if (parts.length !== 3) throw new Error();
    const [source, sourceId, skillId] = parts.map(decodeURIComponent);
    const binding: ShortcutBinding = { skillId, source, ...(sourceId === "-" ? {} : { sourceId }) };
    if (!isShortcutBinding(binding) || qualifiedSkillId(binding) !== id) throw new Error();
    return binding;
  } catch { throw new Error("Skill 来源指令格式无效"); }
}
export function resolveShortcutBinding(binding: ShortcutBinding, commands: ComposerCommand[]): ComposerCommand {
  if (!isShortcutBinding(binding)) throw new Error("Skill 来源绑定无效，请重新配置");
  const matches = commands.filter(command => command.shortcutBinding?.skillId === binding.skillId && (!binding.source || qualifiedSkillId(command.shortcutBinding) === qualifiedSkillId(binding)));
  if (matches.length !== 1) throw new Error(matches.length > 1 ? "Skill 来源存在歧义，请在扩展设置重新绑定" : "Skill 在当前项目不可用，可能已禁用、移除或被项目来源覆盖");
  return matches[0];
}
export function assertQualifiedSkillMentions(content: string, commands: ComposerCommand[]): void {
  for (const match of content.matchAll(/(^|\s)\/(ext-skill\/[^\s]*)/g)) {
    const binding = parseQualifiedSkillId(match[2]);
    if (!binding) throw new Error("Skill 来源指令无效");
    const command = resolveShortcutBinding(binding, commands);
    if (command.name !== match[2]) throw new Error("Skill 来源已变化，请重新插入按钮");
  }
}
