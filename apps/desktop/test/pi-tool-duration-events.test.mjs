import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));
const { createEventsSlice } = await import("../src/stores/slices/events-slice.ts");

const { createSessionRuntime } = await import("../src/stores/runtime/session-runtime.ts");

for (const durationMs of [0, 47, undefined, -1, NaN, Infinity]) {
  test(`tool completion prefers valid Pi duration (${durationMs})`, () => {
    let state = { activeSessionId: "s", messages: [], retainedTranscripts: {}, pendingPermissions: [], pendingAsks: [], sessionTodos: {} };
    const get = () => state;
    const set = update => { state = { ...state, ...(typeof update === "function" ? update(state) : update) }; };
    const runtime = createSessionRuntime({ get, set });
    const slice = createEventsSlice({
      get, set, runtime,
      withoutRecordKey: (record, key) => { const copy = { ...record }; delete copy[key]; return copy; },
      sessionModeForPlanningState: () => "agent", openPlanArtifact() {}, notifyInteractivePrompt() {},
      flushPendingSessionConfiguration: async () => {}, assistantErrorMessage: () => ({ role: "assistant", content: "" }),
      withCompactionMark: (marks, mark) => [...(marks ?? []), mark],
    });
    state.handleAgentEvent = slice.handleAgentEvent;
    slice.handleAgentEvent({ sessionId: "s", turnId: "t", ts: 1000,
      event: { type: "tool_start", toolCallId: "read", toolName: "Read", args: {} } });
    slice.handleAgentEvent({ sessionId: "s", turnId: "t", ts: 1200,
      event: { type: "tool_end", toolCallId: "read", result: "done", durationMs } });
    assert.equal(state.messages[0].toolStatus, "success");
    assert.equal(state.messages[0].toolDurationMs,
      typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 200);
  });
}
