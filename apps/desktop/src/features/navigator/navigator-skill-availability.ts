import type { ComposerCommand } from "@pi-desktop/shared";

/** Use the authoritative merged Launcher catalog without reconstructing source precedence. */
export async function loadNavigatorSkillAvailability(
  loadCatalog: () => Promise<{ commands: ComposerCommand[] }>,
): Promise<Set<string>> {
  const { commands } = await loadCatalog();
  return new Set(commands.flatMap(command => command.kind === "skill" && command.skillId ? [command.skillId] : []));
}
