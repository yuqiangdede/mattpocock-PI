import { ENGINEERING_SHORTCUTS, type EngineeringShortcutAction } from "./engineering-shortcuts";

export const SHORTCUT_GROUPS = ["exploration", "maintenance", "collaboration", "projectSetup"] as const;
export type ShortcutGroup = typeof SHORTCUT_GROUPS[number];
export type ShortcutBinding = { skillId: string; source?: string; sourceId?: string };
export type SkillShortcut = {
  id: string; presetId?: EngineeringShortcutAction; binding: ShortcutBinding;
  name?: string; prompt?: string; note?: string;
  position: "primary" | "more"; group: ShortcutGroup; enabled: boolean;
};
export type ShortcutConfiguration = {
  schemaVersion: 1; presetVersion: number; buttons: SkillShortcut[];
  deletedPresetIds: string[]; migration?: { engineeringPrompts?: boolean };
};
const exploration = ["spec", "tickets", "grillMe", "grilling", "research", "questionnaire", "prototype"];
const collaboration = ["retro", "handoff", "teach", "waitWhat", "writingForAgents", "wizard"];
export function createDefaultShortcutConfiguration(): ShortcutConfiguration {
  const primary = ["ask", "discovery", "implement", "diagnose", "review"];
  const entries = [...ENGINEERING_SHORTCUTS].sort((a, b) => {
    const left = primary.indexOf(a.action), right = primary.indexOf(b.action);
    return (left < 0 ? 100 : left) - (right < 0 ? 100 : right);
  });
  return { schemaVersion: 1, presetVersion: 1, deletedPresetIds: [], buttons: entries.map(({ action, skill }) => ({
    id: `matt:${action}`, presetId: action, binding: { skillId: skill }, enabled: true,
    position: primary.includes(action) ? "primary" : "more",
    group: action === "initialize" ? "projectSetup" : exploration.includes(action) ? "exploration" : collaboration.includes(action) ? "collaboration" : "maintenance",
  })) };
}
export function validateShortcutConfiguration(value: unknown): asserts value is ShortcutConfiguration {
  const fail = (): never => { throw new Error("快捷按钮配置格式或版本无效"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const config = value as ShortcutConfiguration;
  if (config.schemaVersion !== 1 || !Number.isSafeInteger(config.presetVersion) || config.presetVersion < 1 || !Array.isArray(config.buttons) || config.buttons.length > 256 || !Array.isArray(config.deletedPresetIds) || config.deletedPresetIds.some(id => typeof id !== "string" || id.length > 128)) fail();
  const ids = new Set<string>();
  for (const button of config.buttons) {
    if (!button || typeof button !== "object" || typeof button.id !== "string" || !button.id || button.id.length > 128 || ids.has(button.id)) fail();
    ids.add(button.id);
    if (button.presetId !== undefined && !ENGINEERING_SHORTCUTS.some(entry => entry.action === button.presetId)) fail();
    if (!button.binding || typeof button.binding.skillId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(button.binding.skillId)) fail();
    for (const field of ["source", "sourceId"] as const) if (button.binding[field] !== undefined && (typeof button.binding[field] !== "string" || button.binding[field]!.length > 256 || /[\\/\0]/.test(button.binding[field]!))) fail();
    if (!["primary", "more"].includes(button.position) || !SHORTCUT_GROUPS.includes(button.group) || typeof button.enabled !== "boolean") fail();
    for (const field of ["name", "prompt", "note"] as const) if (button[field] !== undefined && (typeof button[field] !== "string" || button[field]!.length > (field === "prompt" ? 16000 : field === "note" ? 4000 : 128) || button[field]!.includes("\0"))) fail();
    if (button.name !== undefined && !button.name.trim()) fail();
    if (!button.presetId && button.name === undefined) fail();
  }
}
export function resolveShortcutText(button: SkillShortcut, translate: (key: string) => string) {
  return { name: button.name ?? translate(`coding.${button.presetId}`), prompt: button.prompt ?? (button.presetId ? translate(`coding.prompts.${button.presetId}`) : ""), note: button.note ?? (button.presetId ? (["when", "purpose", "example"] as const).map(section => `${translate(`settings.engineering.${section}`)}: ${translate(`coding.skillGuides.${button.presetId}.${section}`)}`).join("\n\n") : "") };
}
export function shortcutPreview(button: SkillShortcut, translate: (key: string) => string): string {
  const { prompt } = resolveShortcutText(button, translate);
  return `/${button.binding.skillId}${prompt ? ` ${prompt}` : ""}`;
}
