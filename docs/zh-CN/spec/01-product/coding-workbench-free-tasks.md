# Coding Workbench and Free Engineering Tasks

> **镜像说明：** 本页对应 [英文源规格](/spec/01-product/coding-workbench-free-tasks)。当前正文保留英文，以源规格为准；本页不宣称已经完成中文翻译。

- Date: 2026-10-02
- Status: Implemented task candidate; release pending
- Authority: Interaction decisions Q1-Q12 and user-path test seams explicitly accepted by the user.
- Audience: Developers using PI-Desktop for coding work.
- Delivery: Additive product capability; current strict Engineering Workflow behavior remains supported.

## Problem Statement

Developers currently enter a conversation through a home surface dominated by
project selection, onboarding and the composer. Common Matt Pocock engineering
skills are not presented as obvious action buttons. The existing Engineering
Workflow supports a strict six-stage process, but simple requests often need
direct implementation or diagnosis without completing earlier stages.

Users need discoverable engineering actions, lightweight intake, visible
execution outcomes and deliberate context handoff without learning slash
commands or confusing a skill reply with formal Stage Completion.

## Solution

Make the home surface a Coding Workbench with eight prominent actions:
Initialize project, Discuss requirements, Form specification, Split tickets,
Implement, Diagnose bug, Review code and Retrospective.

Free Task is the default mode. Any action can be used in any order. Suggested
journeys provide guidance only. Clicking a card opens a task panel; only an
explicit Start admits execution. A plain-language task description is the only
required content input. Documents, tickets and logs are optional.

Keep Coding Tools and Back to Workbench available inside conversations. Support
current-conversation execution and explicitly selected new conversations.
Present results as cards and allow reviewed artifact handoff to another skill.
Retain Full Engineering Workflow as an optional strict mode with its existing
acceptance, reopening and prerequisite rules.

## User Stories

1. As a developer, I want all eight coding actions visible on the workbench, so that I can discover the available tools.
2. As a developer, I want each action to explain its purpose, so that I can choose without knowing a skill identifier.
3. As a developer, I want suggested action order without mandatory sequencing, so that guidance does not prevent simple work.
4. As a developer, I want to implement a plain-language request directly, so that I do not need a specification or ticket first.
5. As a developer, I want to diagnose a bug at any time, so that existing projects can receive immediate investigation.
6. As a developer, I want to form a specification from available context, so that clarified needs become reviewable requirements.
7. As a developer, I want to split work into tickets when useful, so that larger efforts have manageable tasks.
8. As a developer, I want code review accessible alongside implementation, so that I can inspect changes before proceeding.
9. As a developer, I want retrospective available independently, so that I can reflect on work performed outside a formal workflow.
10. As a developer, I want a task panel before execution, so that I can review scope and context.
11. As a developer, I want optional documents, tickets and logs, so that intake remains lightweight.
12. As a developer, I want follow-up questions inside the conversation when needed, so that incomplete details can be clarified.
13. As a developer, I want the current project and execution directory visible, so that work affects the intended project.
14. As a developer, I want my draft retained while choosing a project, so that setup does not lose my request.
15. As a developer, I want to continue in my current conversation by default, so that previous reasoning remains available.
16. As a developer, I want a new task conversation when needed, so that unrelated work can remain isolated.
17. As a developer, I want to preview inherited artifacts before launch, so that only relevant context transfers.
18. As a developer, I want to remove inherited references, so that I control what the next task receives.
19. As a developer, I want to prepare a task while a conversation is busy, so that I can plan the next action.
20. As a developer, I want to wait or choose a new conversation, so that busy-state handling is explicit.
21. As a developer, I want to withdraw waiting work, so that unwanted tasks do not start later.
22. As a developer, I want concurrent code changes isolated, so that tasks do not overwrite each other's work.
23. As a developer, I want a visible Stop action and cancellation outcome, so that I can control active execution.
24. As a developer, I want explicit retry with retained inputs and previous outcomes, so that failures are recoverable.
25. As a developer, I want interrupted work to remain identifiable without automatic replay, so that recovery is deliberate.
26. As a developer, I want a result card listing work, artifacts, checks and remaining items, so that I can assess the outcome.
27. As a developer, I want optional next-skill suggestions, so that results can lead naturally to further work.
28. As a developer, I want free tasks independent of formal stage acceptance, so that casual actions do not corrupt workflow status.
29. As a developer, I want the existing strict workflow available, so that larger efforts retain controlled acceptance.
30. As a developer, I want to initialize a new or existing project, so that both greenfield and ongoing projects can use the workbench.
31. As a developer, I want a selectable initialization checklist, so that only needed preparation is performed.
32. As a developer, I want Add/Modify/Keep previews and diffs, so that I can inspect initialization changes.
33. As a developer, I want existing files kept by default, so that initialization preserves my configuration.
34. As a developer, I want failed initialization items retried independently, so that completed work is not unnecessarily repeated.
35. As a developer, I want missing skills and model setup explained with remediation links, so that visible actions are recoverable.
36. As a developer, I want drafts retained during remediation, so that installation or configuration does not lose work.
37. As a developer, I want to return to the workbench without stopping execution, so that navigation is independent of task lifetime.
38. As a keyboard user, I want accessible actions and predictable focus, so that I can complete the same coding journeys.
39. As a developer using a narrow window, I want readable cards and task controls, so that the workbench remains usable.
40. As a returning developer, I want retained task outcomes and no silent restart, so that navigation and recovery do not misrepresent progress.

## Implementation Decisions

### Workbench and action catalog

- Place project name, directory and selector above the workbench; keep the
  existing composer below it.
- Group Discuss requirements, Form specification, Split tickets and Implement
  as a suggested journey. Group Initialize project, Diagnose bug, Review code
  and Retrospective as common actions. Preserve that reading order when stacked.
- Each card shows a localized action name, a short purpose and an obvious launch
  button. The task panel identifies the actual skill being invoked.
- Map discussion to `grill-with-docs`, specification to `to-spec`, tickets to
  `to-tickets`, implementation to `implement`, diagnosis to `diagnosing-bugs`,
  review to `code-review` and retrospective to `retro`.
- There is no complete existing `init-project` skill. Initialization is an
  explicitly designed composition using the existing execution infrastructure,
  not a misleading alias for opening a directory or cloning a repository.
- Preserve project selection, ordinary chat and first-use configuration access.
  Do not hide engineering actions behind setup or slash-command knowledge.

### Free Task intake and execution

- Free Task has no accepted-stage prerequisite. Formal Workflow Run and Stage
  Completion retain their glossary meanings and existing contracts.
- Task panel order: action, project context, task description, optional
  attachments, conversation destination and Start.
- Require a non-empty task description. A project-bound action also requires a
  valid execution directory. Treat missing directory, skill or model as execution
  prerequisites, never as an uncompleted engineering stage.
- Direct implementation must accept plain-language work without a document or
  tracker issue. Verify the actual selected skill contract and provide compatible
  intake when it assumes specs or tickets. Do not fabricate tickets or silently
  skip skill execution just to enable a button.
- Continue in the current conversation by default. A selected new conversation
  transfers the task description and previewed references, without silently
  copying unselected conversation history.
- Opening a panel or selecting a suggestion never executes a skill. Start
  revalidates current project, conversation, skill availability and admission.

### Busy state, lifecycle and ownership

- A busy conversation still allows preparing a draft. At launch, expose waiting
  for current work or starting a new conversation. Waiting is visibly pending and
  withdrawable before admission.
- Reuse normal Agent execution and admission boundaries; prevent duplicate
  execution across repeat clicks, delayed acknowledgements and navigation.
- Bind every attempt to the originating project, conversation and execution
  identity. Later navigation or stale outcomes cannot reassign it.
- Concurrent code-changing tasks use dedicated worktrees in Git repositories.
  If isolation cannot be established, report the blocker before mutation rather
  than execute concurrent changes against the same files.
- Running attempts expose Stop. A stop request remains pending until the actual
  cancellation outcome is known; transport failure remains visible.
- Failed, cancelled and interrupted attempts retain their inputs and outcomes.
  Retry is a new explicit attempt. Restart never silently replays work.
- Retain drafts and task outcome references across navigation; settled outcomes
  remain available after restart. Pending execution must reconcile with the
  authoritative runtime before any new attempt.
- Draft UI state may reuse existing draft facilities. Durable authoritative task
  records and filesystem operations remain Host-owned; Renderer never owns SQLite
  or direct filesystem writes, and Main remains a thin orchestrator.
- Preserve existing permissions, skill precedence, disabled/removed choices,
  resource validation and sandbox boundaries. New public contracts, persistence
  or ownership changes require the applicable ADR and compatibility tests.

### Results and handoff

- Show task identity and outcome, completed work, changed files/artifacts,
  actual verification status and remaining items.
- Normal reply termination is execution completion, not proof that every
  requested behavior or check succeeded. Report unchecked and failed validation
  distinctly; a failed, stopped or interrupted attempt cannot appear successful.
- Expose Continue and optional next actions. Discussion suggests specification
  or direct implementation; specification suggests tickets or implementation;
  implementation suggests review, diagnosis or retrospective.
- Opening a suggestion creates a draft with previewed artifact references and
  removal controls. It never launches automatically or changes stage acceptance.
- Free Task results do not automatically complete, reopen or unlock formal
  workflow stages. Full Engineering Workflow remains optional and unchanged.

### Initialization safety

- Support Create new project and Adopt existing project.
- Inspect directory and stack before mutations. Present selectable conventions,
  skills, startup and verification setup items.
- Preview exact files as Add, Modify or Keep. Existing files default to Keep;
  modification requires user selection and an inspectable diff.
- Execute only selected items after explicit start. Revalidate files before
  writes; if they changed since preview, refresh the affected preview rather than
  apply stale approved content.
- Validate project-root containment and escaping links at the filesystem boundary.
  Preserve unrelated files and do not install or enable skills silently.
- Record per-item results. Partial retry rechecks current files and attempts only
  failed selected items. Never overwrite later user edits with old snapshots.
- Provide concrete startup and verification guidance and report the checks
  actually executed, including unresolved setup work.

### Remediation, navigation and accessibility

- Missing or disabled skills and missing model configuration leave cards visible.
  Explain the blocker and expose Install, Enable or Configure as appropriate.
  Retain the draft while the user remedies it; remediation does not execute
  automatically or override user-owned skill edits.
- Conversation headers expose Coding Tools and Back to Workbench. Navigation
  does not stop active tasks; the workbench shows project-owned task status.
- Wide windows use multiple columns and a side task panel; narrow windows use
  one column and a full-width task view without horizontal scrolling.
- Use existing shared UI primitives and i18n for all visible and accessible text.
  Status must remain understandable without color or icons.
- Opening the panel moves focus inside; closing restores focus to the invoking
  control and retains the draft. All input, artifact and execution actions must
  work with keyboard navigation.

### Acceptance criteria

| ID | Observable requirement |
| --- | --- |
| AC-01 | All eight actions have obvious launch controls; selecting one opens intake without execution. |
| AC-02 | Any free action can start out of order; direct implementation accepts plain-language work without a spec or ticket. |
| AC-03 | Project and execution prerequisites are visible and revalidated; a missing project or model does not discard the draft. |
| AC-04 | Current-conversation execution retains context; a new conversation transfers only the previewed task context. |
| AC-05 | Busy intake supports withdrawable waiting or a new conversation; repeated activation cannot create duplicate attempts. |
| AC-06 | Concurrent code-changing tasks use isolated worktrees or report an isolation blocker before writes. |
| AC-07 | Stop targets the originating execution; failure to cancel is visible and cannot cancel a later task. |
| AC-08 | Retry retains prior inputs/outcomes; project switches and restart preserve attribution without silent replay. |
| AC-09 | Result cards show actual outcome, artifact links, verification status and remaining work without overstating completion. |
| AC-10 | Next-action drafts preview removable references and require explicit Start. |
| AC-11 | Free actions leave strict workflow acceptance unchanged; the existing strict path continues to enforce its gates. |
| AC-12 | New and existing project initialization inspect first, preview exact changes and default existing files to Keep. |
| AC-13 | Initialization detects stale previews, path escapes and partial failure; retry preserves subsequent user edits. |
| AC-14 | Missing/disabled skill remediation preserves drafts, user edits and activation choices. |
| AC-15 | Back to Workbench retains active task execution and displays the correct project status. |
| AC-16 | All eight actions, panel controls and results remain usable at narrow width and with keyboard-only interaction. |
| AC-17 | Drafts survive navigation; settled task outcome references survive restart and uncompleted attempts reconcile without replay. |

## Testing Decisions

The user explicitly accepted the primary test seam: Workbench launch through
conversation execution, result presentation and next-skill handoff. Exercise
public component/service interfaces with real internal wiring; substitute only
real external edges such as model responses. Avoid testing private method names,
incidental call counts, fragile DOM nesting or snapshots as behavior evidence.

- Primary user-path integration/component coverage enters from the workbench:
  select Implement, describe simple work without tickets, start, observe result,
  select Review, remove an inherited reference and start the next action.
- Parameterized public-path coverage verifies all eight action mappings and
  arbitrary ordering, together with unchanged formal workflow acceptance.
- Admission/lifecycle contract tests cover busy waiting, withdrawal, duplicate
  clicks, stale acknowledgements, Stop ownership, retry, project/session switches
  and interrupted restart using explicit synchronization and controlled clocks.
- Host/filesystem integration tests cover existing-file defaults, selected diffs,
  preview-to-write changes, root containment, escaping links and partial retry
  after later user edits. Verify existing user data remains intact.
- Component tests verify missing-skill remediation with retained drafts,
  keyboard focus, localized accessible names and narrow-width usability.
- Reuse existing project-switcher, composer draft/context, workflow IPC/history,
  skill activation and Host lifecycle testing approaches. Existing source-layout
  assertions can protect structure but do not replace user-path tests.
- Relevant fixture-based Electron E2E covers actual cross-process admission,
  cancellation/recovery, restart and initialization filesystem boundaries using
  a known task candidate and base revision. Paid providers and user-owned running
  Desktop instances are not default test environments.
- Do not run `verify:ui:*` unless the user explicitly requests it. Run applicable
  targeted static, contract, integration and candidate E2E gates during
  implementation. This specification task performs document validation only.

## Out of Scope

- Replacing the existing strict Engineering Workflow or removing its acceptance.
- Automatically accepting formal stages from free-task results.
- Mandatory ticket creation, specification writing or full-process progression.
- Autonomous skill chaining, automatic replay or unattended remediation.
- A new agent engine, expanded permissions, renderer filesystem/SQLite ownership.
- Rewriting user-owned skills or silently installing/enabling removed skills.
- Cloud collaboration, ticket assignment, Git push, merge or release automation.
- Specification publication alone does not authorize implementation, commits,
  branch publication or PR creation; implementation is a separate request.

## Further Notes

All interaction decisions are accepted; concrete technical decomposition remains
implementation work. Inspect the actual bundled and user-overridden skill
contracts before coding. Changes to ownership, persistence or public execution
contracts need architecture review and an ADR before implementation; this spec
does not claim those contracts already exist.

The existing Engineering Workflow specification remains authoritative for strict
Workflow Runs. This is an additive specification for Free Tasks. Update the
corresponding E2E scenario documentation alongside the spec and keep current
implementation status distinct from accepted requirements.
