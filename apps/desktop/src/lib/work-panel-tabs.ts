export type WorkPanelTabKind = "review" | "terminal" | "browser" | "file";

export type WorkPanelTab = {
  id: string;
  kind: WorkPanelTabKind;
  resource?: string;
};

export type WorkPanelTabsState = {
  tabs: WorkPanelTab[];
  activeTabId: string | null;
};

export type ReviewArtifactEvent = {
  toolName?: string;
  isError?: boolean;
  result: unknown;
  sessionId: string;
  activeSessionId?: string;
};

export function toolWorkPanelTab(
  kind: Exclude<WorkPanelTabKind, "file">,
): WorkPanelTab {
  return { id: kind, kind };
}

export function normalizeWorkPanelFilePath(path: string): string {
  const normalizedSeparators = path.replace(/\\/g, "/");
  const absolute = normalizedSeparators.startsWith("/");
  const segments: string[] = [];

  for (const segment of normalizedSeparators.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      const previous = segments.at(-1);
      if (previous && previous !== "..") {
        segments.pop();
      } else if (!absolute) {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  const normalized = segments.join("/");
  return absolute ? `/${normalized}` : normalized;
}

export function fileWorkPanelTab(path: string): WorkPanelTab {
  const resource = normalizeWorkPanelFilePath(path);
  return { id: `file:${resource}`, kind: "file", resource };
}

export function toolResultRoot(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const root = (details as { root?: unknown }).root;
  return typeof root === "string" ? root : null;
}

export function shouldOpenReviewArtifact(event: ReviewArtifactEvent): boolean {
  return (
    (event.toolName === "Write" || event.toolName === "Edit") &&
    event.isError !== true &&
    toolResultRoot(event.result) === "workspace" &&
    event.sessionId === event.activeSessionId
  );
}

export function openWorkPanelTabState(
  state: WorkPanelTabsState,
  tab: WorkPanelTab,
): WorkPanelTabsState {
  const index = state.tabs.findIndex((item) => item.id === tab.id);
  if (index === -1) {
    return { tabs: [...state.tabs, tab], activeTabId: tab.id };
  }
  const tabs = [...state.tabs];
  tabs[index] = tab;
  return { tabs, activeTabId: tab.id };
}

export function activateWorkPanelTabState(
  state: WorkPanelTabsState,
  tabId: string,
): WorkPanelTabsState {
  return state.tabs.some((tab) => tab.id === tabId)
    ? { ...state, activeTabId: tabId }
    : state;
}

export function closeWorkPanelTabState(
  state: WorkPanelTabsState,
  tabId: string,
): WorkPanelTabsState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return state;

  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (state.activeTabId !== tabId) return { tabs, activeTabId: state.activeTabId };
  return {
    tabs,
    activeTabId: tabs[Math.min(index, tabs.length - 1)]?.id ?? null,
  };
}
