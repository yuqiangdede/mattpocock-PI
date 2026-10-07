import { dirname } from "node:path";

export type LoadedSkillDocument = {
  id: string;
  name: string;
  body: string;
  /** Absolute path of the loaded SKILL.md document. */
  location: string;
};

/** One resolution order shared by ordinary Skill execution and navigation. */
export async function resolveSkillDocument(
  id: string,
  projectPath: string | null,
  sources: {
    builtin: (id: string) => LoadedSkillDocument | null;
    user: (id: string, projectPath: string | null) => Promise<LoadedSkillDocument | null>;
    plugin: (id: string) => LoadedSkillDocument;
  },
): Promise<LoadedSkillDocument> {
  return sources.builtin(id) ?? (await sources.user(id, projectPath)) ?? sources.plugin(id);
}

/** Add path metadata only when a skill is loaded, not to the catalog prompt. */
export function formatSkillToolContent(skill: LoadedSkillDocument): string {
  return [
    `# Skill: ${skill.name} (${skill.id})`,
    `Location: ${skill.location}`,
    `References are relative to ${dirname(skill.location)}.`,
    "",
    skill.body,
  ].join("\n");
}
