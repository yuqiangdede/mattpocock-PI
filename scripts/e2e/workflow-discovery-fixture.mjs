import { createEngineeringSkillChecks } from "../../apps/desktop/electron/main/engineering-skill-checks";
import { createEngineeringSkillUpdater } from "../../apps/desktop/electron/main/engineering-skill-update";
import { join } from "node:path";
import { mkdir, rmdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { registerAgentIpc } from "../../apps/desktop/electron/main/ipc/agent-ipc";
import { registerWorkflowIpc } from "../../apps/desktop/electron/main/ipc/workflow-ipc";
import { createWorkflowExecutionService } from "../../apps/desktop/electron/main/services/workflow-execution";
import { createComposerCommandService } from "../../apps/desktop/electron/main/ipc/composer-ipc";
import { createSessionCoordination } from "../../apps/desktop/electron/main/runtime/session-coordination";
import { createAgentHostBridge } from "../../apps/desktop/electron/main/agent-host-bridge";
import { formatSkillToolContent } from "../../apps/desktop/electron/main/skill-document";
import { IPC } from "../../packages/shared/src/protocol";
import { createFreeTaskService } from "../../apps/desktop/electron/main/services/free-task-execution";
import { registerFreeTaskIpc } from "../../apps/desktop/electron/main/ipc/free-task-ipc";
import { createEventPersistence } from "../../apps/desktop/electron/main/runtime/event-persistence";
import { PersistenceOutbox } from "../../apps/desktop/electron/main/persistence-outbox";
import { InflightCheckpointer } from "../../packages/host-runtime/src/inflight-checkpoint";
import { createNavigatorAnalysisService } from "../../apps/desktop/electron/main/services/navigator-analysis";
import { registerNavigatorAnalysisIpc } from "../../apps/desktop/electron/main/ipc/navigator-analysis-ipc";
import { resolveSkillDocument } from "../../apps/desktop/electron/main/skill-document";

/** The process/provider edge is deterministic; Pi, Main admission and Host stay real. */
export function registerWorkflowDiscoveryFixture({ registrar, getHost, dataDir, root }) {
  let updateOffline = false;
  const updateRevision = "b".repeat(40);
  const updater = createEngineeringSkillUpdater({ getHost, fetchBundle: async () => {
    if (updateOffline) throw new Error("offline fixture");
    const bundle = JSON.parse(await readFile(join(root, "crates/host-core/resources/workflow-skills.json"), "utf8"));
    bundle.revision = updateRevision; return bundle;
  }, notify: () => {} });
  const checks = createEngineeringSkillChecks({ getHost, fetchRevision: async () => { if (updateOffline) throw new Error("offline fixture"); return updateRevision; }, update: updater, report: () => {} });
  const handlers = new Map();
  const agentRegistrar = { ...registrar, handle(channel, handler) { handlers.set(channel, handler); registrar.handle(channel, handler); } };
  const activeTurns = new Map();
  const coordination = createSessionCoordination({ activeTurns, getMainWindow: () => null, getViewingSessionId: () => null });
  const bridge = createAgentHostBridge({ channels: IPC.invoke, getHost, isSessionBusy: coordination.isSessionBusy,
    invoke: (channel, args) => handlers.get(channel)(...args), log() {} });
  let releaseDispatch = () => {};
  let dispatchGate = Promise.resolve();
  const logger = { app: (_category, level, message, details) => { if (level === "warn" || level === "error") console.error("WORKFLOW_FIXTURE_DIAGNOSTIC", message, JSON.stringify(details)); } };
  let releaseLaunch = () => {};
  let launchGate = new Promise((resolve) => { releaseLaunch = resolve; });
  let releaseProvider = () => {};
  let providerGate = new Promise((resolve) => { releaseProvider = resolve; });
  let mode = "normal";
  let prompts = 0;
  let analysisRequests = 0;
  let createAnalysisStream;
  let releaseAnalysis = () => {};
  const analysisGate = new Promise(resolve => { releaseAnalysis = resolve; });
  let skillLoads = 0;
  const skillIds = [];
  const skillBodies = [];
  let catalogUnavailable = false;
  let catalogGate = Promise.resolve();
  let releaseCatalog = () => {};
  let catalogStarted = Promise.resolve();
  let markCatalogStarted = () => {};
  let transformed = "";
  const runtimes = new Set();
  const boundRuntimes = new Map();
  const tasks = new Set();
  const catalog = createComposerCommandService({
    plugins: { listLoaded: () => [], getSkills: () => [], getCommands: () => [] },
    agentExtensions: { allCommands: () => [] },
    activeUserSkills: async (projectPath) => (await getHost().call("skills.active", { projectPath })).skills,
    pluginActiveInProject: () => false,
    loadComposerTemplatesCached: async () => [],
  });
  const analysisService = process.env.PI_DEVELOPMENT_NAVIGATOR === "1" ? createNavigatorAnalysisService({
    getHost, acquireSessionOperation: coordination.acquireSessionOperation,
    reportCleanupError: operation => logger.app("runtime", "warn", "analysis cleanup failed", { operation }),
    catalog: path => catalog.buildComposerCommands(path),
    loadSkill: (id, path) => resolveSkillDocument(id, path, {
      builtin: () => null,
      user: async (skillId, projectPath) => { const loaded = await getHost().call("skills.read", { id: skillId, projectPath }); return loaded.skill && loaded.body ? { ...loaded.skill, body: loaded.body, location: loaded.skill.path } : null; },
      plugin: () => { throw new Error("Fixture has no plugin skills"); },
    }),
    provider: async (host, sessionId) => {
      const { session } = await host.call("session.get", { id: sessionId });
      if (!session) throw new Error("Fixture analysis session unavailable");
      return { provider: { id: "workflow-fixture", name: "Fixture", baseUrl: "http://127.0.0.1:1/v1", modelId: "fixture-model", apiKey: "", authKind: "none", supportsReasoning: false, supportedThinkingLevels: ["off"] }, providerId: "workflow-fixture", modelId: "fixture-model", thinkingLevel: "off" };
    },
    stream: (_model, context) => {
      analysisRequests++;
      if (context.tools?.length) throw new Error("Navigation exposed model tools");
      const evidence = JSON.parse(context.messages[0].content[0].text);
      if (evidence.evidence.some(result => result.path === "navigator-result.md")) throw new Error("Navigation included an unchecked file");
      if (!createAnalysisStream) throw new Error("Complete the fixture activity before navigation");
      const stream = createAnalysisStream();
      const message = { role: "assistant", api: "openai-completions", provider: "workflow-fixture", model: "fixture-model", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ skillId: "to-spec", reason: "Preserve the agreed requirements", basis: ["Requirements discussion"] }, { skillId: "code-review", reason: "Review the recorded outcome", basis: ["Activity reply"] }] }) }], usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 1 };
      void analysisGate.then(() => { stream.push({ type: "start", partial: message }); stream.push({ type: "done", reason: "stop", message }); stream.end(message); });
      return stream;
    },
  }) : null;
  if (analysisService) registerNavigatorAnalysisIpc(registrar, getHost, analysisService);
  if (process.env.PI_CODING_WORKBENCH === "1") {
    registrar.handle(IPC.invoke.settingsSet, settings => getHost().call("settings.set", settings));
    registrar.handle(IPC.invoke.skillBundleStatus, checks.status);
    registrar.handle(IPC.invoke.skillBundleCheck, checks.check);
    registrar.handle(IPC.invoke.skillBundleUpdate, checks.update);
    registrar.handle(IPC.invoke.settingsGet, () => getHost().call("settings.get"));
    registrar.handle(IPC.invoke.todosGet, (input) => getHost().call("todos.get", input));
    registrar.handle(IPC.invoke.liveVoiceStatus, () => ({ enabled: false, bindings: [], selectedBindingId: null }));
    registrar.handle(IPC.invoke.composerCommands, async () => {
      const { workspace } = await getHost().call("workspace.get");
      markCatalogStarted();
      await catalogGate;
      if (catalogUnavailable) throw new Error("Deterministic catalog unavailable");
      return { commands: await catalog.buildComposerCommands(workspace?.path ?? null) };
    });
  }
  const finishTurn = async (sessionId, status, errorCode, { turnId }) => {
    if (navigatorPersistence) await navigatorOutbox.flush(getHost);
    if (coordination.peekAbortReason(sessionId, turnId) === "aborted") { status = "aborted"; errorCode = "TURN_ABORTED"; }
    if (getHost()) await getHost().call("session.endTurn", { turnId, status, errorCode, createNotification: false });
    if (activeTurns.get(sessionId) === turnId) activeTurns.delete(sessionId);
    bridge.endTurn(sessionId, turnId, status === "completed" ? "completed" : status === "aborted" ? "canceled" : "failed");
    bridge.agentHost.kick(sessionId);
  };
  const navigatorOutbox = process.env.PI_DEVELOPMENT_NAVIGATOR === "1" ? new PersistenceOutbox(dataDir, (level, message, data) => logger.app("persistence", level, message, data)) : null;
  const navigatorCheckpointer = process.env.PI_DEVELOPMENT_NAVIGATOR === "1" ? new InflightCheckpointer(checkpoint => getHost().call("session.saveInflightMessage", checkpoint)) : null;
  const navigatorPersistence = process.env.PI_DEVELOPMENT_NAVIGATOR === "1" ? createEventPersistence({
    runtimeState: { get host() { return getHost(); } }, steeringReplies: new Set(), activeTurns,
    activeToolCalls: new Map(), activeToolCallKey: (sessionId, id) => `${sessionId}:${id}`,
    approvedExecutionIdsBySession: new Map(), approvedExecutionTurns: new Map(), pendingExecutionFinishes: new Map(),
    planSubmissionTurnIds: new Set(), planSubmissionTurnKey: (sessionId, id) => `${sessionId}:${id}`,
    inflightCheckpointer: navigatorCheckpointer, persistenceOutbox: navigatorOutbox,
    addActiveTurnUsage: coordination.addActiveTurnUsage, logger, finishTurn,
    isStaleTerminalEvent: envelope => activeTurns.get(envelope.sessionId) !== envelope.turnId,
    finishApprovedExecution: async () => {}, emitAgentEvent: () => {},
  }) : null;
  const sidecar = {
    setProjectInstructionRoot() {}, clearProjectInstructionRoot() {}, clearVendorAuthBindings() {},
    async call(method, input) {
      if (method === "agent.abort") {
        const bound = boundRuntimes.get(input.turnId);
        if (!bound) return { ok: false, aborted: false };
        if (mode === "cancelFailure") throw new Error("Deterministic cancellation transport failure");
        const aborted = bound.abort();
        releaseProvider();
        await aborted;
        await finishTurn(input.sessionId, "aborted", "TURN_ABORTED", { turnId: input.turnId });
        return { ok: true, aborted: true };
      }
      if (method !== "agent.prompt") throw new Error(`Unexpected fixture process operation: ${method}`);
      prompts++;
      transformed = input.content;
      const { DesktopAgentRuntime } = await import(pathToFileURL(join(root, "packages/agent-runtime/dist/index.js")).href);
      const { createAssistantMessageEventStream } = await import(pathToFileURL(join(root, "packages/agent-runtime/node_modules/@earendil-works/pi-ai/dist/index.js")).href);
      createAnalysisStream = createAssistantMessageEventStream;
      const host = getHost();
      const runtimeHost = {
        async call(name, params) {
          if (name === "tools.execute" && params.toolName === "Skill") {
            const active = (await host.call("skills.active", { projectPath: input.projectPath })).skills;
            if (!active.some((skill) => skill.id === params.args.id)) throw new Error("Fixture skill is not enabled");
            const loaded = await host.call("skills.read", { id: params.args.id, projectPath: input.projectPath });
            if (!loaded.skill || !loaded.body) throw new Error("Fixture skill is missing");
            skillLoads++;
            skillIds.push(params.args.id);
            skillBodies.push(loaded.body);
            return { ok: true, content: formatSkillToolContent({ ...loaded.skill, body: loaded.body, location: loaded.skill.path }) };
          }
          return host.call(name, params);
        },
      };
      const runtime = new DesktopAgentRuntime({ ...input, host: runtimeHost, onEvent: envelope => navigatorPersistence?.persistAgentEvent(envelope) });
      runtimes.add(runtime);
      boundRuntimes.set(input.turnId, runtime);
      let round = 0;
      const currentMode = mode;
      const currentProviderGate = providerGate;
      // Replace only the external model stream; tools and the Pi loop stay real.
      runtime.models.streamSimple = (_model, context) => {
        round++;
        const skillId = input.content.match(/in order: "([^"]+)"/)?.[1] ?? "grill-with-docs";
        const tool = round === 1 ? { type: "toolCall", id: `skill-${prompts}`, name: "Skill", arguments: { id: skillId } } : null;
        if (!tool && !context.messages.some((message) => message.role === "toolResult" && !message.isError)) {
          throw new Error("Pi did not replay the real Skill result");
        }
        const stream = createAssistantMessageEventStream();
        const message = {
          role: "assistant", api: "openai-completions", provider: "workflow-fixture", model: "fixture-model",
          content: tool ? [tool] : [{ type: "text", text: "Requirements clarified. Awaiting user confirmation." }],
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: tool ? "toolUse" : currentMode === "failure" ? "error" : "stop",
          ...(currentMode === "failure" && !tool ? { errorMessage: "401 deterministic provider refusal" } : {}),
          timestamp: round,
        };
        void (async () => {
          if (!tool) await currentProviderGate;
          stream.push({ type: "start", partial: message });
          if (message.stopReason === "error") stream.push({ type: "error", reason: "error", error: message });
          else stream.push({ type: "done", reason: tool ? "toolUse" : "stop", message });
          stream.end(message);
        })();
        return stream;
      };
      const task = runtime.prompt(input.content, input.userMessageId, input.turnId)
        .then(() => finishTurn(input.sessionId, currentMode === "failure" ? "error" : "completed", currentMode === "failure" ? "FIXTURE_PROVIDER_FAILURE" : undefined, { turnId: input.turnId }))
        .catch((error) => { console.error("WORKFLOW_FIXTURE_RUNTIME_ERROR", error.stack ?? String(error)); return finishTurn(input.sessionId, "error", "FIXTURE_PROVIDER_FAILURE", { turnId: input.turnId }); })
        .finally(async () => { await runtime.dispose(); runtimes.delete(runtime); boundRuntimes.delete(input.turnId); tasks.delete(task); });
      tasks.add(task);
      if (currentMode === "uncertain") throw new Error("sidecar RPC timeout: agent.prompt");
      if (currentMode === "mismatched") return { accepted: true, turnId: "stale-unrelated-turn" };
      return { accepted: true, turnId: input.turnId };
    },
  };
  registerAgentIpc({
    registrar: agentRegistrar, getHost, getSidecar: () => sidecar, getAgentHostBridge: () => bridge,
    logger, vendorOAuth: {}, agentExtensions: { cancelPrompts() {} }, cancelSessionTools() {}, persistenceOutbox: { flush: async () => {} },
    dataDir, activeTurns, isTurnDispatchable: () => true, activeTurnUsages: coordination.activeTurnUsages,
    approvedExecutionIdsBySession: new Map(), claimedExecutionSessions: new Map(),
    async resolveAgentRuntimeLaunch(sessionId, session) {
      await launchGate;
      if (mode === "modelMissing") throw Object.assign(new Error("Model not configured"), { errorCode: "MODEL_NOT_CONFIGURED" });
      const commandShell = (await getHost().call("commandShells.list")).effective;
      return { projectPath: session.projectPath, providerId: "workflow-fixture", modelId: "fixture-model", sidecarParams: {
        sessionId, projectPath: session.projectPath, mode: "agent", thinkingLevel: "off", commandShell,
        provider: { id: "workflow-fixture", name: "Deterministic Workflow provider", baseUrl: "http://127.0.0.1:1/v1", modelId: "fixture-model", apiKey: "", authKind: "none", supportsReasoning: false, supportedThinkingLevels: ["off"] },
        pluginSkills: (await getHost().call("skills.active", { projectPath: session.projectPath })).skills,
      } };
    },
    acquireSessionOperation: coordination.acquireSessionOperation, finishTurn, lockAbortReason: coordination.lockAbortReason, clearAbortReason: coordination.clearAbortReason,
    finishApprovedExecution: async () => {}, dispatchApprovedPlan: async () => {}, dispatchExecutionForProposal: async () => {},
    emitAgentEvent() {}, setNotificationViewingSessionId() {}, optionalWorkspaceRoot: async () => null,
    composerCommandService: catalog, loadComposerTemplatesCached: async () => [],
  });
  registerWorkflowIpc({ registrar, getHost, execution: createWorkflowExecutionService({
    getHost, catalog: (path) => catalog.buildComposerCommands(path), submit: async (request) => { await dispatchGate; return handlers.get(IPC.invoke.agentPrompt)(request); }, logger,
    onIdle: (sessionId) => bridge.kickQueue(sessionId),
    cancel: (request) => handlers.get(IPC.invoke.agentAbort)(request),
  }) });
  if (process.env.PI_CODING_WORKBENCH === "1") {
    registerFreeTaskIpc(registrar, createFreeTaskService({ getHost,
      catalog: (path) => catalog.buildComposerCommands(path),
      submit: (request) => handlers.get(IPC.invoke.agentPrompt)(request),
      cancel: (request) => handlers.get(IPC.invoke.agentAbort)(request),
    }));
    registrar.handle(IPC.invoke.projectInitPreview, (input) => getHost().call("freeTask.initPreview", input));
    registrar.handle(IPC.invoke.projectInitApply, (input) => getHost().call("freeTask.initApply", input));
    registrar.handle(IPC.invoke.projectInitRead, (input) => getHost().call("freeTask.initRead", input));
    registrar.handle(IPC.invoke.projectInitCreateDirectory, (input) => getHost().call("freeTask.initCreateDirectory", input));
    registrar.handle(IPC.invoke.projectGroupCreate, (input) => getHost().call("project.group.create", input));
    registrar.handle(IPC.invoke.projectPickFolders, () => ({ folders: [join(dataDir, "..", "project-b")] }));
    registrar.handle(IPC.invoke.sessionList, () => getHost().call("session.list"));
    registrar.handle(IPC.invoke.sessionGet, (input) => getHost().call("session.get", input));
    registrar.handle(IPC.invoke.sessionCreate, (input) => getHost().call("session.create", input));
    registrar.handle(IPC.invoke.projectSet, (path) => getHost().call("workspace.set", { path }));
    registrar.handle(IPC.invoke.skillList, (input) => getHost().call("skills.list", input));
    registrar.handle(IPC.invoke.skillSetEnabled, (input) => getHost().call("skills.setEnabled", input));
  }
  return {
    async action(name, input) {
      if (name === "movePointer") {
        const { BrowserWindow } = await import("electron");
        BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({ type: "mouseMove", x: Math.round(input.x), y: Math.round(input.y) });
        return;
      }
      if (name === "pressKey") {
        const { BrowserWindow } = await import("electron");
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        contents.sendInputEvent({ type: "keyDown", keyCode: input });
        contents.sendInputEvent({ type: "keyUp", keyCode: input });
        return;
      }
      if (name === "customizeBundledSkill") {
        const original = await getHost().call("skills.read", { id: "retro", level: "global" });
        await getHost().call("skills.update", { id: "retro", name: "retro", level: "global", body: original.body + "\nLocal fixture customization." });
        await getHost().call("skills.setEnabled", { id: "retro", level: "global", enabled: false });
        return;
      }
      if (name === "readCustomizedSkill") return getHost().call("skills.read", { id: "retro", level: "global" });
      if (name === "updateOffline") { updateOffline = input; return; }
      if (name === "typeText") { const { BrowserWindow } = await import("electron"); await BrowserWindow.getAllWindows()[0].webContents.insertText(input); return; }
      if (name === "holdCatalog") {
        catalogGate = new Promise((resolve) => { releaseCatalog = resolve; });
        catalogStarted = new Promise((resolve) => { markCatalogStarted = resolve; });
        return;
      }
      if (name === "waitForCatalog") { await catalogStarted; return; }
      if (name === "releaseCatalog") { releaseCatalog(); return; }
      if (name === "catalogUnavailable") { catalogUnavailable = input; return; }
      if (name === "setSkillEnabled") return getHost().call("skills.setEnabled", { id: input.id, level: "project", projectPath: input.path, enabled: input.enabled });
      if (name === "resize") { const { BrowserWindow } = await import("electron"); BrowserWindow.getAllWindows()[0].setSize(input.width, input.height); return; }
      if (name === "blockInitialization") { const parent = join(dataDir, "..", "project-a", "scripts"); await mkdir(parent, {recursive:true}); await mkdir(join(parent, "verify.ps1")); return; }
      if (name === "unblockInitialization") { await rmdir(join(dataDir, "..", "project-a", "scripts", "verify.ps1")); await writeFile(join(dataDir, "..", "project-a", "AGENTS.md"), "Later user configuration", "utf8"); return; }
      if (name === "readInitializationConvention") return readFile(join(dataDir, "..", "project-a", "AGENTS.md"), "utf8");
      if (name === "allowCancellation") { mode = "normal"; return; }
      if (name === "releaseLaunch") { releaseLaunch(); return; }
      if (name === "holdDispatch") { dispatchGate = new Promise((resolve) => { releaseDispatch = resolve; }); return; }
      if (name === "releaseDispatch") { releaseDispatch(); return; }
      if (name === "releaseProvider") { releaseProvider(); await Promise.all([...tasks]); return; }
      if (name === "reset") { mode = input ?? "normal"; launchGate = new Promise((resolve) => { releaseLaunch = resolve; }); providerGate = new Promise((resolve) => { releaseProvider = resolve; }); return; }
      if (name === "releaseAnalysis") { releaseAnalysis(); return; }
      if (name === "snapshot") return { prompts, analysisRequests, skillLoads, transformed, skillIds, skillBodies };
      if (name === "updateActionSkill") return getHost().call("skills.update", { id: "code-review", name: "code-review", level: "project", projectPath: input.path, body: input.body });
      if (name === "corruptActionConfig") return writeFile(join(dataDir, "extensions", "coding-actions.json"), "{invalid-actions", "utf8");
      if (name === "readActionConfig") return readFile(join(dataDir, "extensions", "coding-actions.json"), "utf8");
      if (name === "hostCall") {
        if (!input.method.startsWith("workflow.") && !input.method.startsWith("session.") && !input.method.startsWith("freeTask.")) throw new Error("Fixture Host method is not allowed");
        return getHost().call(input.method, input.params);
      }
      if (name === "ordinaryPrompt") return handlers.get(IPC.invoke.agentPrompt)(input);
      if (name === "disableSkill") return getHost().call("skills.setEnabled", { id: "grill-with-docs", level: "project", projectPath: input.path, enabled: input.enabled });
      throw new Error(`Unknown Workflow fixture action: ${name}`);
    },
    async dispose() { checks.stop(); releaseLaunch(); releaseProvider(); releaseAnalysis(); await analysisService?.dispose(); await Promise.all([...runtimes].map((runtime) => runtime.dispose())); await Promise.all([...tasks]); await navigatorOutbox?.flush(getHost); navigatorCheckpointer?.dispose(); },
  };
}

export async function crashWorkflowFixtureHost(host) {
  await new Promise((resolve) => {
    const unsubscribe = host.onExit(() => { unsubscribe(); resolve(); });
    host.child.kill("SIGKILL");
  });
  await host.dispose();
}
