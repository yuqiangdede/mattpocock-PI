# Engineering Workflow

Engineering Workflow describes a project's software engineering process alongside its Pi conversations.
This glossary records terms resolved during product discovery; it is not an implementation specification.

## Language

**Update Source**:
An independently updatable product: the Matt Pocock skill bundle or the
mattpocock-PI application. Upstream PI-Desktop is part of an application release,
not a separate installed product.
_Avoid_: upstream baseline as an install target

**Version Check**:
Reading the installed version and querying a source for newer published content.
A check does not download or install that content.
_Avoid_: update installation

**Update Channel**:
The user's choice of eligible application releases: stable releases only, or
stable and prerelease versions. Neither choice authorizes a downgrade.
_Avoid_: automatic installation policy

**Skill Backup**:
A recoverable snapshot of the installed skill bundle before an explicit update.
Restoring it retains subsequent local customizations.
_Avoid_: application rollback

**Workflow Run**:
A single development effort that proceeds through Discovery, Spec, Tickets, Implement, Review, and Retro. A project can retain multiple runs, with only one active run at a time.
_Avoid_: Project workflow, chat, agent turn

**Stage Completion**:
The user's explicit acceptance that a stage has met its purpose. The end of a Pi reply, an error, or cancellation does not constitute stage completion.
_Avoid_: Turn completion, skill completion

**Requirements Confirmation**:
The user's explicit approval of a particular specification content version as the basis for task breakdown, implementation and acceptance. It can originate outside a Workflow Run and remains historical when the requirements change.
_Avoid_: Requirements freeze, specification generation, stage completion

**Confirmed Requirements Version**:
The specification content version approved by the user at a particular point in time. Later edits require renewed confirmation and do not erase the earlier decision.
_Avoid_: Immutable requirements, permanently approved document

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

**Extension Settings（扩展设置）**:
mattpocock-PI 扩展功能的配置区域，与原生 PI 设置保持独立边界。
_Avoid_: 原生设置、独立安装产品

**Coding Action（编码动作）**:
用户可独立选择的编码操作，只引用一个 Skill 并可附加请求文本；不代表阶段、完成状态或前置条件。
_Avoid_: 页面按钮配置、Workflow Step、强制阶段

**Skill Launcher**:
将 Coding Action 交给当前项目和会话的原生 Pi Agent 执行的附加操作入口。
_Avoid_: Workflow Engine、状态机、Recommendation Engine

**Development Navigator**:
未来用于理解项目开发状态、检查产物并提供可选建议的能力，属于第二阶段且不限制用户选择 Action。
_Avoid_: 固定流程、自动阶段推进

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
