# Engineering Workflow

Engineering Workflow describes a project's software engineering process alongside its Pi conversations.
This glossary records terms resolved during product discovery; it is not an implementation specification.

## Language

**Workflow Run**:
A single development effort that proceeds through Discovery, Spec, Tickets, Implement, Review, and Retro. A project can retain multiple runs, with only one active run at a time.
_Avoid_: Project workflow, chat, agent turn

**Stage Completion**:
The user's explicit acceptance that a stage has met its purpose. The end of a Pi reply, an error, or cancellation does not constitute stage completion.
_Avoid_: Turn completion, skill completion

**Stage Reopening**:
Returning a completed stage to active work, withdrawing completion eligibility from that stage and all later stages while retaining historical artifacts.
_Avoid_: Reset, artifact deletion

**Historical Artifact**:
An engineering output retained from earlier work even when its stage is reopened. Retention alone does not establish eligibility for current downstream work.
_Avoid_: Current approved output

**Stage Execution**:
One attempt to perform work within a stage, bound to the project, workflow run, and Pi session selected when it starts. An execution ending does not complete its stage.
_Avoid_: Workflow run, stage completion

**Interrupted Execution**:
An execution stopped before a settled outcome, including work still active when the application shuts down. Resuming work requires an explicit user action rather than automatic replay.
_Avoid_: Completed stage, automatic retry

**Implementation Stage**:
The stage in which development tasks are implemented through one or more executions. The user confirms that all tasks are complete before proceeding to Review; V0 does not claim measured per-ticket progress.
_Avoid_: Single implementation turn

**Workflow Project**:
The logical PI-Desktop project group that owns workflow runs across its registered directories and conversations. A session's working directory remains distinct from this ownership.
_Avoid_: Current directory, current chat

**Review Acceptance**:
The user's explicit decision that implementation is ready to proceed to Retro after review. Findings can instead return the run to Implement without invalidating the accepted Discovery, Spec, or Tickets stages.
_Avoid_: Review turn completion
