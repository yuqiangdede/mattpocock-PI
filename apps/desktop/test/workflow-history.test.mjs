import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { en } from "@pi-desktop/i18n";
import { WORKFLOW_STAGES } from "@pi-desktop/shared";

test("reopened executions, accepted decisions and artifact references are explicitly historical", async () => {
  const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), configFile: false,
    server: { middlewareMode: true, hmr: false, ws: false }, esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { WorkflowExecutionHistory } = await server.ssrLoadModule("/src/components/workpanel/WorkflowExecutionHistory.tsx");
    const { WorkflowArtifactList } = await server.ssrLoadModule("/src/components/workpanel/WorkflowArtifactList.tsx");
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { translation: en } } });
    const run = {
      id: "run-a", title: "Reopened history", outcome: "active", createdAt: 1, updatedAt: 2, archivedAt: null,
      stages: WORKFLOW_STAGES.map((stage, index) => ({ id: stage.id, revision: 2, status: index ? "locked" : "ready", prerequisite: index ? WORKFLOW_STAGES[index - 1].id : null,
        awaitingConfirmation: false, acceptance: null, acceptanceHistory: index ? [] : [{ executionId: "old-execution", stageRevision: 1, acceptedAt: 1 }] })),
      executions: [{ id: "old-execution", requestId: "old-request", projectGroupId: "group-a", runId: "run-a", stageId: "discovery", stageRevision: 1, sessionId: "original-chat", turnId: "original-turn", phase: "normal", uncertainAdmission: false, createdAt: 1, startedAt: 1, endedAt: 2, errorCode: null, activeTicketId: null }],
      artifactReferences: [{ id: "old-spec", runId: "run-a", stageId: "spec", stageRevision: 1, kind: "spec", workspaceRoot: "/project", relativePath: "docs/spec-v1.md", ticketId: null }],
    };
    const markup = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement("div", null,
      createElement(WorkflowExecutionHistory, { run }),
      createElement(WorkflowArtifactList, { entries: [{ reference: run.artifactReferences[0], historical: true, availability: "missing" }], busy: false, onOpen: assert.fail }))));
    assert.match(markup, /data-workflow-historical="true"/);
    assert.match(markup, /original-chat/);
    assert.match(markup, /docs\/spec-v1.md/);
    assert.match(markup, /Accepted Discovery, revision 1 \(historical\)/);
    assert.match(markup, /Historical/);
    assert.doesNotMatch(markup, /Current revision/i);
    assert.match(markup, /Missing file/);
    assert.match(markup, /disabled=""/);
    assert.equal(run.artifactReferences[0].stageRevision, 1);
  } finally { await server.close(); }
});
