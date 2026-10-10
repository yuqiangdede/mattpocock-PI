# Engineering Workflow

Engineering Workflow describes a project's software engineering process alongside its Pi conversations.
This glossary records terms resolved during product discovery; it is not an implementation specification.

## Language

**Full Auto**:
The permission mode that approves eligible agent tool actions without a permission prompt. It does not remove the restrictions of an operating mode or prevent the agent from asking task questions.
_Avoid_: unrestricted agent, no questions

**Service Preset**:
A selectable starting point for configuring a model service. It supplies an endpoint and connection format; the user supplies their own SK and chooses the models.
_Avoid_: preconfigured account, bundled credential

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

**Work Item**:
An optional project-scoped engineering-goal container that groups explicitly
linked existing Pi conversations and later references verified artifacts,
tasks and evidence. Work Item relationships do not own Session lifecycles.
One Work Item focuses on one requirement, defect or refactoring objective;
ordinary ungrouped conversations remain supported.
_Avoid_: Chat folder as the only purpose, Session, a fixed workflow stage,
automatic transcript-based grouping, a second Session owner

**Work Item Session Association**:
An explicit and reversible link from one durable Session ID to a Work Item
within the same logical project. It changes navigation metadata only;
unassigning or deleting a Work Item does not delete the underlying Session.
_Avoid_: Session migration, transcript ownership, automatic context merging

**Development Navigator**:
第二阶段的开发任务与运行状态可视化控制面。围绕当前开发事项，串联需求决策、实施计划、执行开发、Review 与 Bug 排查，支持跨 Skill 的 Spec/Plan/执行产物可靠交接、动态任务图、任务进度、变更影响和过程回溯；不限制用户自由调用 Action。2026-10-10 的完整产品目标见 `docs/project/development-navigator-positioning.md`；首版 #46 是较窄的迭代范围。
_Avoid_: 固定流程、自动阶段推进、把 Agent 运行结束等同于任务完成、把首版活动记录等同于完整任务图

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
