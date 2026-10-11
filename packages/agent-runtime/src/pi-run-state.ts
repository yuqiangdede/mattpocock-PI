import type { AgentState } from "@earendil-works/pi-agent-core";
import type { AgentRunState } from "@pi-desktop/shared";

/** Pi remains busy until all awaited listeners settle, including agent_end. */
export function projectPiRunState(
  isStreaming: AgentState["isStreaming"],
  terminal: AgentRunState["phase"] = "idle",
  desktopBusy = false,
  turnId?: string,
): AgentRunState {
  return {
    phase: isStreaming || desktopBusy ? "running" : terminal,
    ...(turnId ? { turnId } : {}),
  };
}

export function terminalPiPhase(
  stopReason: string | undefined,
  causeName?: string,
): "completed" | "aborted" | "error" {
  if (stopReason === "aborted" || causeName === "AbortError") return "aborted";
  return stopReason === "error" ? "error" : "completed";
}

/** Pi durations are monotonic. Zero means executed immediately, not missing. */
export function normalizePiDuration(value: number | undefined, fallback?: number): number | undefined {
  const valid = (duration: number | undefined): duration is number =>
    typeof duration === "number" && Number.isFinite(duration) && duration >= 0;
  return valid(value) ? value : valid(fallback) ? fallback : undefined;
}
