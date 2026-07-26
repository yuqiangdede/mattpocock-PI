import assert from "node:assert/strict";
import test from "node:test";

const {
  activateWorkPanelTabState,
  closeWorkPanelTabState,
  fileWorkPanelTab,
  normalizeWorkPanelFilePath,
  openWorkPanelTabState,
  shouldOpenReviewArtifact,
  toolWorkPanelTab,
} = await import("../src/lib/work-panel-tabs.ts");

test("work panel tabs open on demand and deduplicate by resource", () => {
  const empty = { tabs: [], activeTabId: null };
  const review = openWorkPanelTabState(empty, toolWorkPanelTab("review"));
  const file = openWorkPanelTabState(review, fileWorkPanelTab("src/App.tsx"));
  const reopened = openWorkPanelTabState(file, toolWorkPanelTab("review"));

  assert.deepEqual(reopened.tabs.map((tab) => tab.id), ["review", "file:src/App.tsx"]);
  assert.equal(reopened.activeTabId, "review");
});

test("file tabs normalize lexical paths and remain distinct by resource", () => {
  const first = fileWorkPanelTab("src\\App.tsx");
  const equivalent = fileWorkPanelTab("./src//components/../App.tsx");
  const second = fileWorkPanelTab("test/App.tsx");

  assert.equal(first.id, "file:src/App.tsx");
  assert.equal(equivalent.id, first.id);
  assert.notEqual(first.id, second.id);
  assert.equal(normalizeWorkPanelFilePath("../src/../App.tsx"), "../App.tsx");
  assert.equal(normalizeWorkPanelFilePath("/repo/./src/../App.tsx"), "/repo/App.tsx");
});

test("closing the active tab selects its right neighbor then its left", () => {
  const state = {
    tabs: [
      toolWorkPanelTab("review"),
      fileWorkPanelTab("src/App.tsx"),
      toolWorkPanelTab("browser"),
    ],
    activeTabId: "file:src/App.tsx",
  };
  const middleClosed = closeWorkPanelTabState(state, "file:src/App.tsx");
  const endClosed = closeWorkPanelTabState(middleClosed, "browser");

  assert.equal(middleClosed.activeTabId, "browser");
  assert.equal(endClosed.activeTabId, "review");
});

test("closing an inactive tab preserves selection and the last close empties state", () => {
  const state = {
    tabs: [toolWorkPanelTab("review"), toolWorkPanelTab("browser")],
    activeTabId: "review",
  };
  const inactiveClosed = closeWorkPanelTabState(state, "browser");
  const empty = closeWorkPanelTabState(inactiveClosed, "review");

  assert.equal(inactiveClosed.activeTabId, "review");
  assert.deepEqual(empty, { tabs: [], activeTabId: null });
});

test("activation ignores stale tab ids", () => {
  const state = { tabs: [toolWorkPanelTab("review")], activeTabId: "review" };
  assert.equal(activateWorkPanelTabState(state, "missing"), state);
});

test("review opens only for successful active-session workspace Write/Edit artifacts", () => {
  const base = {
    toolName: "Write",
    isError: false,
    result: { details: { root: "workspace" } },
    sessionId: "active",
    activeSessionId: "active",
  };

  assert.equal(shouldOpenReviewArtifact(base), true);
  assert.equal(shouldOpenReviewArtifact({ ...base, toolName: "Edit" }), true);
  assert.equal(shouldOpenReviewArtifact({ ...base, toolName: "Bash" }), false);
  assert.equal(shouldOpenReviewArtifact({ ...base, isError: true }), false);
  assert.equal(
    shouldOpenReviewArtifact({
      ...base,
      result: { details: { root: "scratch" } },
    }),
    false,
  );
  assert.equal(
    shouldOpenReviewArtifact({ ...base, sessionId: "background" }),
    false,
  );
});
