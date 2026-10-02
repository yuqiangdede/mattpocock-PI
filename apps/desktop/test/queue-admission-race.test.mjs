import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { IPC } from "@pi-desktop/shared";

test("an ordinary composer send racing admission retains its draft in the existing queue", async () => {
  const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  const previousWindow = globalThis.window;
  try {
    const { createQueueSlice } = await server.ssrLoadModule("/src/stores/slices/queue-slice.ts");
    const queued = [];
    const retracted = [];
    const accepted = [];
    globalThis.window = { piDesktop: { invoke: async (channel, input) => {
      if (channel === IPC.invoke.agentPrompt) return { ok: false, error: { code: "AGENT_BUSY", message: "AGENT_BUSY" } };
      if (channel === IPC.invoke.agentQueuePush) { const entry = { id: "queued-ordinary", ...input, createdAt: "2026-10-01T00:00:00Z" }; queued.push(entry); return { ok: true, data: entry }; }
      if (channel === IPC.invoke.agentQueueList) return { ok: true, data: { entries: queued } };
      throw new Error(`Unexpected IPC ${channel}`);
    } } };
    const draft = { text: "ordinary user input", fileReferences: [{ path: "src/example.ts", name: "example.ts" }] };
    let state = { activeSessionId: "chat-a", page: "chat", pendingPlans: {}, runningSessions: {}, messages: [],
      sessions: [{ id: "chat-a", title: "Existing chat", source: "desktop" }], queuedPrompts: {}, latestTurnResults: {}, sessionOutcomes: {}, showToast: assert.fail };
    const slice = createQueueSlice({ get: () => state, set: (patch) => { state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }; },
      runtime: { sessionTranscriptCache: new Map(), submittedComposerDrafts: new Map(), insertOptimisticUserMessage() {}, retractOptimisticUserMessage: (_id, message) => retracted.push(message) },
      promptAttachmentsFromDraft: (refs) => refs.map((ref) => ({ kind: "file", path: ref.path, name: ref.name })),
      withoutRecordKey: (record, id) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== id)),
      isDefaultSessionTitle: () => false, viewingSessionIdForPrompt: () => "chat-a", messageErrorFromUnknown: (error) => ({ code: error.code, message: error.message }),
      assistantErrorMessage: assert.fail,
    });
    Object.assign(state, slice);
    assert.equal(await slice.sendPrompt(draft.text, draft, "chat-a", (id) => accepted.push(id)), true);
    await slice.refreshQueuedPrompts("chat-a");
    assert.deepEqual(accepted, ["chat-a"]);
    assert.equal(retracted.length, 1);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].content, draft.text);
    assert.equal(queued[0].attachments[0].path, "src/example.ts");
    assert.equal(state.latestTurnResults["chat-a"], undefined);
    assert.equal(state.queuedPrompts["chat-a"][0].content, draft.text);
  } finally { globalThis.window = previousWindow; await server.close(); }
});

test("the real Agent Host queue retains input when the runtime becomes busy before admission", async () => {
  const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { createAgentHostBridge } = await server.ssrLoadModule("/electron/main/agent-host-bridge.ts");
    const records = new Map();
    let busy = true;
    const bridge = createAgentHostBridge({ channels: IPC.invoke, log() {},
      getHost: () => ({ call: async (method, input) => {
        if (method === "session.get") return { session: { id: input.id, permissionMode: "ask" } };
        if (method === "session.queuePush") { records.set(input.id, input); return {}; }
        if (method === "session.queueRemove") return { removed: records.delete(input.id) };
        if (method === "session.queueList") return { entries: [...records.values()] };
        throw new Error(`Unexpected Host method ${method}`);
      } }),
      invoke: async (channel) => {
        assert.equal(channel, IPC.invoke.agentPrompt);
        if (busy) throw Object.assign(new Error("AGENT_BUSY"), { errorCode: "AGENT_BUSY", code: 1008 });
        return { accepted: true, turnId: "ordinary-admitted" };
      },
    });
    const queued = await bridge.queue.push({ sessionId: "chat-a", content: "retain ordinary input" });
    assert.equal(bridge.queue.list("chat-a")[0].id, queued.id);
    assert.equal(records.get(queued.id).content, "retain ordinary input");
    busy = false;
    bridge.kickQueue("chat-a");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(records.size, 0);
  } finally { await server.close(); }
});
