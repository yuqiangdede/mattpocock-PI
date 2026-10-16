import { describe, expect, it, vi } from "vitest";
import type { Api, AssistantMessage, Model, Models, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { compact, generateSummaryWithUsage } from "./pi-runtime-compaction-summary.js";
import type { CompactionPreparation } from "./pi-runtime-types.js";

const model = {
  id: "reasoning-model", provider: "test", api: "openai-responses",
  reasoning: true, maxTokens: 64_000, contextWindow: 128_000,
} as Model<Api>;
const messages = [{ role: "user" as const, content: "Summarize this task", timestamp: 1 }];
const usage = {
  input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
function harness() {
  const completeSimple = vi.fn(async (_model: unknown, _context: unknown, options?: SimpleStreamOptions) => ({
    role: "assistant", api: model.api, provider: model.provider, model: model.id,
    // Simulate reasoning consuming the old fixed output budget.
    content: [{ type: "text", text: "Task summary" }], usage,
    stopReason: options?.maxTokens !== undefined && options.maxTokens < 20_000 ? "length" : "stop",
    timestamp: 2,
  } as AssistantMessage));
  return { completeSimple, models: { completeSimple } as unknown as Models };
}

describe("summary output budgets", () => {
  it.each([1_000, 16_384, 100_000])("does not cap reasoning output by reserveTokens=%s", async (reserve) => {
    const { models, completeSimple } = harness();
    const result = await generateSummaryWithUsage(messages, models, model, reserve,
      undefined, undefined, "high", undefined, undefined, undefined);
    expect(result).toEqual({ ok: true, value: { text: "Task summary", usage } });
    expect(completeSimple.mock.calls[0]?.[2]).not.toHaveProperty("maxTokens");
    expect(completeSimple.mock.calls[0]?.[2]).toMatchObject({ reasoning: "high", cacheRetention: "none" });
  });

  it("allows both split-turn summaries to complete and combines usage", async () => {
    const { models, completeSimple } = harness();
    const preparation: CompactionPreparation = {
      messagesToSummarize: messages, turnPrefixMessages: messages, retainedTail: [],
      isSplitTurn: true, tokensBefore: 50_000,
      fileOps: { read: new Set(), written: new Set(), edited: new Set() },
      settings: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
    };
    const result = await compact(preparation, models, model, undefined, "high", undefined, undefined, undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary).toContain("Turn Context (split turn)");
      expect(result.value.usage?.totalTokens).toBe(60);
    }
    expect(completeSimple).toHaveBeenCalledTimes(2);
    for (const call of completeSimple.mock.calls) expect(call[2]).not.toHaveProperty("maxTokens");
  });
});
