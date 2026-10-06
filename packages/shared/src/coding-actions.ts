import type { ComposerCommand } from "./types/composer.js";
import { ENGINEERING_SHORTCUTS, validateEngineeringSettings } from "./engineering-shortcuts.js";

export type CodingAction = {
  id: string;
  label: string;
  description?: string;
  skillId: string;
  enabled?: boolean;
  prompt?: string | null;
  icon?: string;
  order?: number;
};
export type CodingActionConfiguration = { schemaVersion: 1; actions: CodingAction[] };
export type CodingActionSnapshot = {
  configuration: CodingActionConfiguration;
  diagnostic?: string;
  recoveryRequired?: boolean;
};

const defaults: CodingAction[] = [
  { id: "discuss-requirements", label: "需求讨论", skillId: "grill-with-docs", order: 0 },
  { id: "create-spec", label: "固化需求", skillId: "to-spec", order: 1 },
  { id: "design", label: "技术设计", skillId: "codebase-design", order: 2 },
  { id: "create-tickets", label: "拆分任务", skillId: "to-tickets", order: 3 },
  { id: "implement", label: "实现", skillId: "implement", order: 4 },
  { id: "code-review", label: "代码审查", skillId: "code-review", order: 5 },
];
export function createDefaultCodingActions(): CodingActionConfiguration {
  return { schemaVersion: 1, actions: structuredClone(defaults) };
}

export class CodingActionError extends Error {
  readonly code: "INVALID_ACTION" | "ACTION_DISABLED" | "SKILL_MISSING";
  constructor(code: "INVALID_ACTION" | "ACTION_DISABLED" | "SKILL_MISSING", message: string) {
    super(message);
    this.code = code;
    this.name = "CodingActionError";
  }
}

// 配置只允许动作定义，不接收页面布局、流程状态或 Skill 正文。
export function validateCodingActions(value: unknown): asserts value is CodingActionConfiguration {
  const fail = (): never => { throw new Error("Coding Actions 配置格式或版本无效"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const config = value as CodingActionConfiguration;
  if (config.schemaVersion !== 1 || !Array.isArray(config.actions) || config.actions.length > 256 || Object.keys(config).some(key => !["schemaVersion", "actions"].includes(key))) fail();
  const ids = new Set<string>();
  const fields = ["id", "label", "description", "skillId", "enabled", "prompt", "icon", "order"];
  for (const action of config.actions) {
    if (!action || typeof action !== "object" || Array.isArray(action) || Object.keys(action).some(key => !fields.includes(key))) fail();
    if (typeof action.id !== "string" || !action.id || action.id.length > 128 || action.id.includes("\0") || ids.has(action.id)) fail();
    ids.add(action.id);
    if (typeof action.label !== "string" || !action.label.trim() || action.label.length > 128 || action.label.includes("\0")) fail();
    if (typeof action.skillId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(action.skillId)) fail();
    if (action.enabled !== undefined && typeof action.enabled !== "boolean") fail();
    if (action.order !== undefined && (!Number.isSafeInteger(action.order) || action.order < 0)) fail();
    if (action.prompt !== undefined && action.prompt !== null && (typeof action.prompt !== "string" || action.prompt.length > 16000 || action.prompt.includes("\0"))) fail();
    for (const key of ["description", "icon"] as const) if (action[key] !== undefined && (typeof action[key] !== "string" || action[key]!.length > (key === "icon" ? 128 : 4000) || action[key]!.includes("\0"))) fail();
  }
}

export class CodingActionRegistry {
  private readonly actions: CodingAction[];
  constructor(configuration: CodingActionConfiguration) {
    validateCodingActions(configuration);
    this.actions = structuredClone(configuration.actions);
  }
  list(enabledOnly = false): CodingAction[] {
    return this.actions.map((action, index) => ({ action, index }))
      .filter(({ action }) => !enabledOnly || action.enabled !== false)
      .sort((a, b) => (a.action.order ?? a.index) - (b.action.order ?? b.index) || a.index - b.index)
      .map(({ action }) => ({ ...action }));
  }
  get(actionId: string): CodingAction {
    const action = this.actions.find(item => item.id === actionId);
    if (!action) throw new CodingActionError("INVALID_ACTION", "编码 Action 不存在");
    return { ...action };
  }
}

// Catalog 已由原生 PI 按现有优先级合并；这里不建立第二套来源规则。
export function resolveCodingAction(actionId: string, registry: CodingActionRegistry, commands: ComposerCommand[]) {
  const action = registry.get(actionId);
  if (action.enabled === false) throw new CodingActionError("ACTION_DISABLED", "编码 Action 已停用");
  const command = commands.find(item => item.kind === "skill" && item.skillId === action.skillId);
  if (!command) throw new CodingActionError("SKILL_MISSING", `Skill missing / unavailable: ${action.skillId}`);
  return { action, command, content: `/${command.name}${action.prompt ? ` ${action.prompt}` : ""}` };
}

export function moveCodingAction(configuration: CodingActionConfiguration, actionId: string, direction: -1 | 1): CodingActionConfiguration {
  const actions = new CodingActionRegistry(configuration).list();
  const index = actions.findIndex(action => action.id === actionId);
  if (index < 0) throw new CodingActionError("INVALID_ACTION", "编码 Action 不存在");
  const target = index + direction;
  if (target < 0 || target >= actions.length) return configuration;
  [actions[index], actions[target]] = [actions[target], actions[index]];
  return { schemaVersion: 1, actions: actions.map((action, order) => ({ ...action, order })) };
}

const legacyIds: Record<string, string> = { discovery: "discuss-requirements", spec: "create-spec", tickets: "create-tickets", implement: "implement", review: "code-review" };
const legacyLabels: Record<string, string> = { ask: "询问 Matt", diagnose: "排查问题", initialize: "初始化工程技能", retro: "复盘" };
export function migrateEngineeringActions(settings: unknown): CodingActionConfiguration {
  const config = createDefaultCodingActions();
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("旧工程设置无效");
  const prompts = (settings as { engineeringShortcutPrompts?: unknown }).engineeringShortcutPrompts;
  if (prompts === undefined) return config;
  validateEngineeringSettings({ engineeringShortcutPrompts: prompts });
  for (const [key, prompt] of Object.entries(prompts as Record<string, string | null>)) {
    const legacy = ENGINEERING_SHORTCUTS.find(item => item.action === key);
    if (!legacy) continue;
    const id = legacyIds[key] ?? `legacy:${key}`;
    const existing = config.actions.find(action => action.id === id);
    if (existing) existing.prompt = prompt;
    else if (typeof prompt === "string") config.actions.push({ id, label: legacyLabels[key] ?? legacy.skill, skillId: legacy.skill, prompt, order: config.actions.length });
  }
  return config;
}

// 仅迁移旧配置内容和顺序；位置、来源锁定和分组不进入新的领域模型。
export function migrateShortcutActions(value: unknown): CodingActionConfiguration {
  if (!value || typeof value !== "object" || (value as { schemaVersion?: unknown }).schemaVersion !== 1 || !Array.isArray((value as { buttons?: unknown }).buttons)) throw new Error("旧快捷配置无效");
  const rows = (value as { buttons: Array<Record<string, unknown>> }).buttons;
  const config: CodingActionConfiguration = { schemaVersion: 1, actions: rows.map((row, index) => {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || !row.id) throw new Error("旧快捷 Action 标识无效");
    const binding = row.binding as { skillId?: unknown } | undefined;
    const preset = typeof row.presetId === "string" ? row.presetId : undefined;
    const id = row.id;
    const fallback = defaults.find(action => action.id === (preset ? legacyIds[preset] : id));
    return {
      id, label: typeof row.name === "string" ? row.name : fallback?.label ?? legacyLabels[preset ?? ""] ?? String(binding?.skillId ?? ""),
      skillId: binding?.skillId as string,
      ...(typeof row.note === "string" ? { description: row.note } : {}),
      ...(typeof row.prompt === "string" ? { prompt: row.prompt } : {}),
      enabled: row.enabled !== false, order: index,
    };
  }) };
  validateCodingActions(config);
  return config;
}
