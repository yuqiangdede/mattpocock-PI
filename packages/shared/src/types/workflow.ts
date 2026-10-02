export const WORKFLOW_STAGES = [
  { id: "discovery", skillId: "grill-with-docs" },
  { id: "spec", skillId: "to-spec" },
  { id: "tickets", skillId: "to-tickets" },
  { id: "implement", skillId: "implement" },
  { id: "review", skillId: "code-review" },
  { id: "retro", skillId: "retro" },
] as const;
export type WorkflowStageId = typeof WORKFLOW_STAGES[number]["id"];

/** Discovery visibility only; never use this to restrict skill execution. */
export function showEngineeringSkillEntry(id: string, query = "", showAll = false): boolean {
  return showAll || Boolean(query.trim()) || WORKFLOW_STAGES.some((stage) => stage.skillId === id);
}

export type WorkflowStage = {
  id: WorkflowStageId;
  revision: number;
  status: "ready" | "locked" | "pending" | "running" | "failed" | "completed";
  prerequisite: WorkflowStageId | null;
  awaitingConfirmation: boolean;
  acceptance: { executionId: string; stageRevision: number; acceptedAt: number } | null;
  acceptanceHistory: NonNullable<WorkflowStage["acceptance"]>[];
};

export type WorkflowExecutionPhase = "pending" | "running" | "normal" | "failed" | "aborted" | "interrupted" | "rejected";
export type WorkflowExecution = {
  id: string;
  requestId: string;
  projectGroupId: string;
  runId: string;
  stageId: WorkflowStageId;
  stageRevision: number;
  sessionId: string;
  turnId: string | null;
  phase: WorkflowExecutionPhase;
  uncertainAdmission: boolean;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  errorCode: string | null;
  activeTicketId: string | null;
};
export type WorkflowAdmission = {
  execution: WorkflowExecution;
  history: WorkflowProjectHistory;
  newReservation: boolean;
};
export type WorkflowDiscoveryRequest = {
  projectGroupId: string;
  runId: string;
  sessionId: string;
  expectedRevision: number;
  requestId: string;
  stageId?: WorkflowStageId;
  activeTicketId?: string;
};
export type WorkflowStageRequest = WorkflowDiscoveryRequest & { stageId: WorkflowStageId };
export type WorkflowDiscoveryStatus = {
  ready: boolean;
  skillId: typeof WORKFLOW_STAGES[number]["skillId"];
  blocker?: { code: string; message: string };
};

export type WorkflowRun = {
  id: string;
  title: string;
  outcome: "active" | "archived" | "done";
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  stages: WorkflowStage[];
  executions: WorkflowExecution[];
  artifactReferences: WorkflowArtifactReference[];
};

export type WorkflowArtifactReference = {
  id: string;
  runId: string;
  stageId: WorkflowStageId;
  stageRevision: number;
  kind: "glossary" | "adr" | "spec" | "ticket" | "review" | "retro";
  workspaceRoot: string;
  relativePath: string;
  ticketId: string | null;
};

export type WorkflowArtifactRegistration = Omit<WorkflowArtifactReference, "id"> & {
  projectGroupId: string;
  expectedRevision: number;
};
export type WorkflowArtifactEntry = {
  reference: WorkflowArtifactReference;
  historical: boolean;
  availability: "available" | "missing" | "rootUnavailable" | "pathDenied" | "notFile" | "accessDenied";
};
export type WorkflowArtifactList = { entries: WorkflowArtifactEntry[]; revision: number };
export type WorkflowArtifactOpen = { entry: WorkflowArtifactEntry; path: string | null };

export type WorkflowProjectHistory = {
  projectGroupId: string;
  projectName: string;
  available: boolean;
  revision: number;
  runs: WorkflowRun[];
  error?: string;
};
