import { qualifiedSkillId, parseQualifiedSkillId, isShortcutBinding, resolveShortcutBinding, type ComposerCommand, type UserSkillRecord } from "@pi-desktop/shared";
import type { LoadedSkillDocument } from "../skill-document";

type SkillEntry = { id: string; name: string; description?: string };
export function qualifiedSkillCommands(builtins: SkillEntry[], users: Array<SkillEntry & { level?: string }>, plugins: Array<SkillEntry & { pluginId: string }>): ComposerCommand[] {
  const occupied = new Set([...builtins, ...users, ...plugins].map(skill => skill.id));
  const entries = [
    ...builtins.map(skill => ({ skill, binding: { skillId: skill.id, source: "builtin" } })),
    ...users.map(skill => ({ skill, binding: { skillId: skill.id, source: "user", sourceId: skill.level } })),
    ...plugins.map(skill => ({ skill, binding: { skillId: skill.id, source: "plugin", sourceId: skill.pluginId } })),
  ].filter(entry => isShortcutBinding(entry.binding));
  // 同一来源身份出现多条记录时不发布 alias，避免 Map 去重掩盖歧义。
  return entries.flatMap(({ skill, binding }) => {
    const id = qualifiedSkillId(binding);
    if (occupied.has(id) || entries.filter(entry => qualifiedSkillId(entry.binding) === id).length !== 1) return [];
    const source = binding.source === "builtin" ? "内置" : binding.source === "user" ? binding.sourceId === "global" ? "全局" : "当前项目" : `插件 ${binding.sourceId}`;
    return [{ name: id, skillId: id, kind: "skill" as const, title: `${skill.name} · ${source}`, description: skill.description, shortcutOnly: true, shortcutBinding: binding }];
  });
}

export type QualifiedSkillLoaderDependencies = {
  catalog: (projectPath: string | null) => Promise<ComposerCommand[]>;
  builtin: (id: string) => LoadedSkillDocument | null;
  plugin: (id: string) => LoadedSkillDocument;
  readUser: (id: string, level: "global" | "project", projectPath: string | null) => Promise<{ skill: UserSkillRecord | null; body: string | null }>;
};
export async function loadQualifiedSkill(id: string, projectPath: string | null, dependencies: QualifiedSkillLoaderDependencies): Promise<LoadedSkillDocument | null> {
  const binding = parseQualifiedSkillId(id);
  if (!binding) return null;
  const verify = async () => resolveShortcutBinding(binding, await dependencies.catalog(projectPath));
  await verify();
  let document: LoadedSkillDocument | null;
  if (binding.source === "builtin") document = dependencies.builtin(binding.skillId);
  else if (binding.source === "plugin") document = dependencies.plugin(binding.skillId);
  else {
    const result = await dependencies.readUser(binding.skillId, binding.sourceId as "global" | "project", projectPath);
    if (!result.skill || result.skill.id !== binding.skillId || result.skill.level !== binding.sourceId || typeof result.body !== "string") throw new Error("Skill 来源在加载期间已变化");
    document = { id, name: result.skill.name, body: result.body, location: result.skill.path };
  }
  if (!document) throw new Error("Skill 文档已移除");
  // 读取可能跨 RPC；再次核对启用目录，禁止在来源变化后回退加载其他来源。
  await verify();
  return { ...document, id };
}
