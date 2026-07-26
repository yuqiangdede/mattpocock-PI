import type { ProviderPublic, ThinkingLevel } from "@pi-desktop/shared";

const CANONICAL_THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export type ThinkingModePreset = "off" | "toggle" | "graded" | "custom";

export function uniqueThinkingLevels(
  levels: readonly ThinkingLevel[],
): ThinkingLevel[] {
  const out: ThinkingLevel[] = [];
  for (const level of levels) {
    if (!CANONICAL_THINKING_LEVELS.includes(level) || out.includes(level)) continue;
    out.push(level);
  }
  return out;
}

export function thinkingModeFromLevels(
  supportsReasoning: boolean,
  levels?: readonly ThinkingLevel[] | null,
): ThinkingModePreset {
  if (!supportsReasoning) return "off";
  const normalized = uniqueThinkingLevels(levels ?? []);
  if (normalized.length === 0) return "graded";
  if (
    normalized.length === 2 &&
    normalized.includes("off") &&
    normalized.includes("high")
  ) {
    return "toggle";
  }
  const gradedDefault: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];
  if (
    normalized.length === gradedDefault.length &&
    gradedDefault.every((level, index) => normalized[index] === level)
  ) {
    return "graded";
  }
  return "custom";
}

export function levelsForThinkingMode(
  mode: ThinkingModePreset,
): ThinkingLevel[] | undefined {
  switch (mode) {
    case "off":
      return undefined;
    case "toggle":
      return ["off", "high"];
    case "graded":
      // Omit explicit list so runtime uses the conservative default graded set.
      return undefined;
    case "custom":
      return undefined;
  }
}

export function formatThinkingLevels(
  levels?: readonly ThinkingLevel[] | null,
): string {
  if (!levels || levels.length === 0) return "";
  return levels.join(",");
}

export function parseThinkingLevelsInput(raw: string): ThinkingLevel[] {
  const parts = raw
    .split(/[\s,|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return uniqueThinkingLevels(parts as ThinkingLevel[]);
}

export function hostFromBaseUrl(baseUrl?: string | null): string {
  if (!baseUrl) return "—";
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl.replace(/^https?:\/\//, "").split("/")[0] || baseUrl;
  }
}

export const API_STYLE_OPTIONS = [
  ["chat_completions", "settings.apiStyleChatCompletions"],
  ["responses", "settings.apiStyleResponses"],
  ["anthropic_messages", "settings.apiStyleAnthropic"],
  ["google_generative_ai", "settings.apiStyleGoogle"],
] as const;

export type ApiStyle = (typeof API_STYLE_OPTIONS)[number][0];

export function normalizeApiStyle(value?: string | null): ApiStyle {
  return API_STYLE_OPTIONS.some(([style]) => style === value)
    ? (value as ApiStyle)
    : "chat_completions";
}

export type ProviderForm = {
  name: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  apiStyle: ApiStyle;
  thinkingMode: ThinkingModePreset;
  customThinkingLevels: string;
  contextWindow: string;
  maxOutputTokens: string;
  temperature: string;
};

export const EMPTY_PROVIDER_FORM: ProviderForm = {
  name: "",
  baseUrl: "",
  modelId: "",
  apiKey: "",
  apiStyle: "chat_completions",
  thinkingMode: "off",
  customThinkingLevels: "off,high",
  contextWindow: "",
  maxOutputTokens: "",
  temperature: "",
};

export function formFromProvider(provider: ProviderPublic): ProviderForm {
  return {
    name: provider.name,
    baseUrl: provider.baseUrl ?? "",
    modelId: provider.defaultModelId ?? "",
    apiKey: "",
    apiStyle: normalizeApiStyle(provider.apiStyle),
    thinkingMode: thinkingModeFromLevels(
      provider.supportsReasoning,
      provider.supportedThinkingLevels,
    ),
    customThinkingLevels:
      formatThinkingLevels(provider.supportedThinkingLevels) || "off,high",
    contextWindow: provider.contextWindow ? String(provider.contextWindow) : "",
    maxOutputTokens: provider.maxOutputTokens
      ? String(provider.maxOutputTokens)
      : "",
    temperature:
      typeof provider.temperature === "number"
        ? String(provider.temperature)
        : "",
  };
}

/** Blank or invalid → 0, which the host treats as "clear the override". */
export function parseTokenCount(raw: string): number {
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function parseTemperature(raw: string): number {
  const parsed = Number.parseFloat(raw.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 2) : 0;
}
