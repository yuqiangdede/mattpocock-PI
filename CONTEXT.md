# Engineering Workflow

Engineering Workflow describes a project's software engineering process alongside its Pi conversations.
This glossary records terms resolved during product discovery; it is not an implementation specification.

## Language

**更新来源**:
可独立查询版本的发布方。本应用区分 PI-Desktop 原版、Matt Pocock 技能包与 mattpocock-PI，检测结果分别属于各自的来源。
_Avoid_: 统一应用版本、技能安装

**版本检测**:
读取当前版本并查询更新来源的最新版本。检测本身不下载或安装更新，也不更改已安装技能。
_Avoid_: 自动升级、安装更新

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

**Free Task**:
A developer-selected engineering activity that can be undertaken independently, without completing prerequisite workflow stages. Its result does not by itself complete a stage in a Workflow Run.
_Avoid_: Workflow stage, shortcut stage completion

**Project Initialization**:
Preparing a new or existing project for coding work through an explicitly selected set of setup activities while retaining existing project configuration.
_Avoid_: Open project, clone repository

**Skill Shortcut**:
A visible coding action that selects an engineering skill in the current conversation's draft. Selection is distinct from the user's explicit submission of that draft.
_Avoid_: Task execution, automatic send

**Engineering Skills Setup**:
Configuring a project's issue tracker, triage vocabulary and domain documentation conventions for engineering skills.
_Avoid_: Project scaffolding, runtime installation

**Shortcut Instruction**:
The editable default request accompanying a Skill Shortcut in the conversation draft. A global customization applies across projects and is separate from the skill's own instructions.
_Avoid_: Skill body, automatic execution

**Engineering Skill Update Check**:
Detecting whether a newer upstream engineering skill bundle is available. Detection does not install that bundle.
_Avoid_: Skill installation, automatic update

**Engineering Skill Update Mode**:
The user's choice between automatic version detection with manual installation and fully manual detection and installation.
_Avoid_: Automatic installation, application update mode
