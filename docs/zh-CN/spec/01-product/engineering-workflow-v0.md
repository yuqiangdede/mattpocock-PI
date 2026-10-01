# Engineering Workflow V0

> **镜像说明：** 本页对应 [英文源规格](/spec/01-product/engineering-workflow-v0)。当前正文保留英文，以源规格为准；本页不宣称已经完成中文翻译。

- Status: Accepted implementation specification; not implemented
- Date: 2026-10-01
- Scope: First productization phase of mattpocock-PI
- Decision authority: Discovery decisions Q1-Q9 accepted explicitly; subsequent recommendations accepted automatically by the user
- Publication: Repository specification finalized; implementation tickets published as GitHub issues #5-#10; no separate specification issue published

## Problem Statement

Developers using PI-Desktop can converse with Pi and invoke skills, but lack a
persistent, project-owned engineering process. They cannot reliably see which
stages have been accepted, which stage is eligible next, or which engineering
outputs belong to the current development effort across conversations and
application restarts.

A model reply ending is insufficient evidence that requirements are understood,
a specification is accepted, all tickets are implemented, or a review passed.
Treating turn completion as engineering completion can unlock work prematurely.
Navigation, retries, cancellation, and background results can also attribute
progress to the wrong project or conversation without explicit execution identity.

## Solution

Provide a compact Engineering Workflow panel inside the existing coding Work
Panel. Each logical project retains named Workflow Runs, with at most one active
run. Each run follows Discovery, Spec, Tickets, Implement, Review, and Retro.

Users invoke each stage through its corresponding installed skill in an existing
Pi session. Pi continues to execute the work. The workflow enforces prerequisites,
records execution outcomes, and waits for explicit user acceptance before
unlocking the next stage. Users may continue a stage, retry failed work, return
from Review to Implement, or reopen earlier work while preserving history.

### Stage definitions

| Stage ID | User-facing purpose | Skill ID | Accepted prerequisite |
| --- | --- | --- | --- |
| discovery | Clarify requirements | grill-with-docs | None |
| spec | Form a specification | to-spec | discovery |
| tickets | Split development tasks | to-tickets | spec |
| implement | Implement tasks | implement | tickets |
| review | Review implementation | code-review | implement |
| retro | Reflect on the development process | retro | review |

All labels, explanations, actions, errors, tooltips, and accessible names follow
the existing application locale. The sequence ends with Retro; done is the run
outcome rather than a seventh stage.

### Observable state transitions

| Condition or action | Stage result | Downstream result |
| --- | --- | --- |
| Create a run | Discovery ready; other stages locked | No accepted stages |
| Prerequisite missing | locked; execution rejected with a reason | No change |
| Start accepted for admission | running; duplicate actions disabled | No automatic progression |
| Matching execution ends normally | ready and awaiting confirmation | Next stage remains locked |
| User accepts an eligible stage | completed | Immediate successor ready |
| Matching execution fails, aborts, or is interrupted | failed with outcome and Retry | Successor remains locked |
| Continue or Retry | running on a new execution identity | No automatic progression |
| Reopen an accepted stage | Acceptance withdrawn for this and later stages | Historical outputs retained |
| Return from Review to Implement | Implement ready; Review and Retro locked | Discovery, Spec, and Tickets remain accepted |
| Accept Retro | Retro completed; run done | Run becomes read-only history |
| Archive an unfinished idle run | Run archived and read-only | A new active run may be created |

Running includes a visibly pending start while admission is unresolved; it does
not falsely claim that Pi has already begun executing. The execution record
separates admission from actual execution.

### Acceptance criteria

| ID | Required observable behavior |
| --- | --- |
| AC-01 | Creating a named run unlocks only Discovery. Opening a project alone creates no run. |
| AC-02 | Each stage uses its registered skill and rejects unmet prerequisites at the authoritative host boundary. |
| AC-03 | A normal turn ending never accepts its stage or automatically starts another stage. |
| AC-04 | Explicit eligible user acceptance unlocks only the next stage; Retro acceptance completes the run. |
| AC-05 | Failure, abort, interruption, rejected admission, and uncertain admission never unlock downstream work. |
| AC-06 | A project retains multiple histories with at most one active run; different projects have separate state. |
| AC-07 | Executions remain bound to their initiating project, run, stage revision, session, and admitted turn across navigation. |
| AC-08 | Busy or queued session work blocks stage admission, including races; no workflow prompt is silently queued. Ordinary composer queuing is preserved. |
| AC-09 | Missing session, unavailable skill, incompatible mode, or pending approval produces a specific blocker without creating sessions, installing skills, switching modes, or approving work. |
| AC-10 | Duplicate starts, stale writes, duplicate terminal events, and unrelated turns cannot advance or overwrite the run. |
| AC-11 | Reopening invalidates affected stage revisions and downstream acceptance while retaining historical references and executions. |
| AC-12 | Review can return to Implement or be explicitly accepted; a Review turn ending cannot imply acceptance. |
| AC-13 | Implement supports repeated executions without invented ticket completion counts. |
| AC-14 | Durable history survives restart; unsettled work is interrupted without replay. Renderer reload alone does not interrupt a live host execution. |
| AC-15 | Stop targets only the bound workflow turn and cannot cancel an unrelated subsequent turn. |
| AC-16 | The native panel follows existing session panel behavior while projecting project-owned workflow state; closing it does not remove state or stop work. |
| AC-17 | Artifact references are revision-associated, host-opened within existing permission boundaries, and never presented as automatically verified. |
| AC-18 | Malformed or unsupported future stored data is preserved with a diagnosable error; existing project and session data remains compatible. |
| AC-19 | Completed and archived runs cannot be executed or edited; history remains inspectable and a new effort uses a new run. |
| AC-20 | Missing project/session bindings remain visible and cannot silently complete, move, merge, or delete retained workflow history. |

## User Stories

1. As a developer, I want to open the workflow inside my existing coding workspace, so that I can follow the process alongside Pi conversations.
2. As a developer, I want to create a named Workflow Run for a development effort, so that unrelated requirements have distinct histories.
3. As a developer, I want one active run per logical project, so that the current effort is unambiguous.
4. As a developer, I want completed and archived runs retained, so that I can inspect earlier work without resetting its records.
5. As a developer, I want to archive unfinished idle work explicitly, so that I can start another effort without deleting its history.
6. As a developer, I want runs shared across a logical project's registered directories and conversations, so that changing chats does not create another process.
7. As a developer, I want separate state for different projects, so that one project's progress cannot unlock another project's stages.
8. As a developer, I want only Discovery initially available, so that I begin with requirements clarification.
9. As a developer, I want locked steps to explain the missing prerequisite, so that I know which stage to finish first.
10. As a developer, I want each stage to invoke its assigned installed skill, so that the engineering guidance matches the stage.
11. As a developer, I want internal development skills to remain internal capabilities, so that the main process stays understandable.
12. As a developer, I want to use an existing project-matching Pi session, so that workflow execution preserves my current agent and context.
13. As a developer, I want a clear blocker when no eligible session exists, so that I can select or create a chat through the established UI.
14. As a developer, I want missing or disabled skills identified before execution, so that metadata is not mistaken for available functionality.
15. As a developer, I want an entry to existing extension management, so that I can resolve missing skills deliberately.
16. As a developer, I want busy sessions rejected without queuing workflow work, so that another task cannot unexpectedly become a stage execution.
17. As a developer, I want pending starts and running work clearly shown, so that repeated clicks cannot create duplicate executions.
18. As a developer, I want skill and runtime errors displayed with a retry action, so that I can recover without losing previous acceptance.
19. As a developer, I want a normally ended execution to await my confirmation, so that a clarification question or partial result cannot advance the process.
20. As a developer, I want to continue a stage across multiple executions, so that discovery and implementation can take multiple conversations.
21. As a developer, I want explicit stage acceptance, so that I control when its engineering purpose has been met.
22. As a developer, I want acceptance unavailable during active or queued work, so that progress reflects a settled result.
23. As a developer, I want failures and cancellations to leave downstream stages locked, so that incomplete work cannot qualify for later stages.
24. As a developer, I want to stop the specific workflow execution, so that cancellation does not affect another turn.
25. As a developer, I want background results attributed to their starting run, so that changing projects or chats does not misreport progress.
26. As a developer, I want to reopen accepted work with an explanation of downstream impact, so that I can revise earlier decisions knowingly.
27. As a developer, I want prior artifacts and execution history retained after reopening, so that I can compare previous work without treating it as current acceptance.
28. As a developer, I want repeated Implement executions before confirming all tasks complete, so that a single completed turn does not stand for all tickets.
29. As a developer, I want ticket references reserved without misleading completion counters, so that V0 remains useful without pretending to manage a board.
30. As a developer, I want Review to let me return to Implement, so that I can address findings while retaining accepted requirements and task planning.
31. As a developer, I want to accept Review explicitly before Retro, so that finishing a review reply is not mistaken for passing review.
32. As a developer, I want Retro as a callable final stage, so that I can capture improvements without automatic changes to project rules.
33. As a developer, I want artifact references listed and opened through existing file handling, so that engineering outputs remain accessible within existing permissions.
34. As a developer, I want missing artifact files shown as unavailable, so that stale references do not silently disappear or fabricate files.
35. As a developer, I want workflow state restored after application restart, so that accepted progress and history are durable.
36. As a developer, I want interrupted work to require manual retry, so that restart cannot unexpectedly repeat file changes or model calls.
37. As a developer, I want panel closure and renderer reload to preserve host-owned work, so that changing the interface does not change execution ownership.
38. As a developer, I want renamed projects and legacy single-directory projects supported, so that existing project organization remains compatible.
39. As a developer, I want unavailable project or session bindings explained without losing history, so that I can resolve them deliberately.
40. As a developer, I want localized, accessible controls consistent with PI-Desktop, so that workflow remains usable with existing themes and input methods.
41. As a developer, I want unsupported stored formats preserved rather than reset, so that newer or damaged state cannot be silently overwritten.
42. As a developer, I want workflow to preserve Pi permissions, operating modes, and ordinary chat behavior, so that process guidance does not bypass established safety boundaries.

## Implementation Decisions

1. Logical project groups own Workflow Runs. New groups use their host-provided identity; legacy groups use the existing compatibility identity. Project names and a currently visible directory are not identity substitutes. Group identity reconciliation must use existing host rules and preserve records rather than silently merge or move histories.
2. Run outcomes are active, done, and archived. Completed and archived runs are immutable. At most one run per group is active. Run creation requires a nonempty title; creating a second active run fails until the previous run completes or is explicitly archived while idle.
3. Rust host-core owns durable documents and authoritative stage transitions. Reuse its existing kv extension with a dedicated workflow namespace, validated format version, and revision. Do not create another database or give the renderer direct SQLite access. No relational schema migration is assumed; any actual database schema change must satisfy the existing migration policy.
4. Store run identity, project identity, title, outcome, timestamps, stage revisions and acceptances, execution history, artifact references, and optional ticket association. A host-generated acceptance record distinguishes user approval from execution outcomes. Timestamps do not decide execution identity or acceptance eligibility.
5. Use expected-revision checks and atomic host mutations for concurrent writes, the single-active-run invariant, and execution admission reservations. Stale requests return a conflict that causes reload rather than overwrite. Invalid or unsupported future documents remain untouched and produce an observable error.
6. WorkflowEngine owns stage eligibility rules rather than model execution. Stage display states are derived from prerequisites, acceptance, and the current revision's latest execution: locked, ready, running, completed, or failed. Pending admission is separately represented in the execution record. A successful end sets awaiting confirmation rather than stage completion.
7. User acceptance requires accepted prerequisites, an active run, no pending or running workflow execution, no active or queued work in the execution's bound session, and a normal successful execution for the current stage revision. A later failed, aborted, interrupted, or rejected attempt removes confirmation eligibility until another execution succeeds. Confirmation cannot rely on files, assistant text, or elapsed time alone.
8. Normal chat work does not automatically mutate workflow acceptance or execution history. Workflow actions are explicit; ordinary turns cannot be attributed simply because they share a session. Users may discuss work normally, but V0 claims progress only through recorded executions and user acceptance.
9. Reopening requires explicit user confirmation of the affected stages, is allowed only while idle, advances the affected stage revisions, and withdraws acceptance for the selected stage and all successors. Historical executions and artifact references remain. Returning from Review applies this operation beginning at Implement. Accepting Retro marks the run done without launching more work.
10. SkillRegistry defines stage metadata and skill mapping, not a second installed skill catalog. Resolve actual availability through existing project-scoped discovery and validate again before dispatch. The existing Skill tool loads instructions; ordering enforcement does not prove that the model followed those instructions.
11. Starting work requires an existing session belonging to the Workflow Project, an available skill, eligible stage, compatible Agent mode, and no pending plan approval. Missing prerequisites or capability produce actionable blockers. Workflow does not create sessions, install skills, change modes, approve plans, or broaden permissions.
12. Reuse the existing Pi prompt transformation, runtime admission, tools, and cancellation paths. The ordinary renderer submission helper currently queues busy inputs and discards the admitted turn response; a minimal explicit boundary extension must support workflow busy rejection and return execution identity while preserving ordinary composer behavior. Do not create a parallel prompt executor or agent adapter.
13. Reserve and persist an execution identity before dispatch, then associate it with the admitted host turn. Bind project group, run, stage revision, session, execution, request, and admitted turn identities. Validate busy and queued work at authoritative admission, including races with ordinary chat input. Allow at most one active execution per run and per session.
14. Reconcile uncertain admission from existing host turn state rather than retrying automatically. Dispatch rejection records failure and leaves the stage unaccepted. Identity correlation must remain valid even if a terminal event arrives before the caller receives the admission response; event loss must not permit duplicate submission.
15. Observe matching outcomes through the existing host runtime lifecycle owner and persist them through host-core. Best-effort plugin notifications are insufficient for durable state or recovery. Duplicate terminal events are idempotent; stale revision events and unrelated turns cannot affect current state. Electron Main remains a thin orchestrator.
16. Renderer reload rehydrates from host state and preserves still-owned execution. Full application or runtime restart marks unsettled attempts interrupted without replay. Stop validates the bound execution and turn at cancellation time so it cannot stop a subsequent ordinary turn. Listener ownership and cleanup cover navigation, panel lifecycle, runtime restart, and shutdown.
17. ArtifactManager manages validated reference metadata in V0. Artifact types are glossary, adr, spec, ticket, review, and retro. References carry run and stage revision, a registered workspace root association, a root-relative path, and optional ticket identity. Existing host path canonicalization and containment rules govern file opening. Missing files remain unavailable references; do not fabricate, delete, or rewrite artifacts. No reference is labeled content-verified.
18. Reserve optional activeTicketId and ticket associations without a task board, independent scheduler, parser, or measured progress counter. Existing Todo and Plan capabilities remain independent; reference useful artifacts without creating a second authority over their execution.
19. Renderer Zustand holds hydrated projections and transient errors/loading. Feature-local services coordinate APIs; components render and wire actions. Host storage, shared validation/contracts, IPC registration, and lifecycle integration stay in their existing owning layers with small responsibility-focused modules. Do not add workflow logic to existing central hotspots.
20. Add a native Workflow tab to the existing Work Panel. Retain session-scoped panel contexts while looking up project-scoped workflow data. Closing a tab does not cancel execution or remove state. The panel provides compact stage status, explanations, skill names, appropriate actions, artifact references, and a small history selector. Reuse shared primitives, theme tokens, and configurable interaction conventions.
21. Project/session navigation changes only the visible projection. Renaming, unavailable bindings, session removal, and project archive cannot imply workflow completion or history deletion. Selecting a compatible existing session enables subsequent idle execution without rebinding an earlier attempt.
22. Implement permits repeated execution until the user confirms all tasks complete. Review offers explicit acceptance or return to Implement. Retro invokes its skill and records user acceptance without automatically modifying rules or skills. No stage launches its successor automatically.

## Testing Decisions

### Primary seam

Exercise the workflow through its highest user-reachable public interface: panel
actions backed by the real workflow service, host transition rules, and existing
Pi admission integration. Cover a coherent user journey rather than replacing
all collaborators with mocks. The user previously accepted this test approach
and authorized automatic acceptance of remaining recommendations.

Use lower-level contract tests only where the primary journey cannot precisely
prove concurrency, protocol identity, restart recovery, or persistence safety.
Test external outcomes and stable contracts, not private functions, incidental
call counts, DOM hierarchy, or large snapshots. Mock only actual external
provider/process/transport boundaries as required by the selected test level.

### Required coverage

| Suite | Behaviors | Acceptance mapping |
| --- | --- | --- |
| Representative user path | Create a run; execute Discovery; observe normal end without unlocking Spec; confirm; continue through Spec, Tickets, and repeated Implement; return from Review; accept Review and Retro; inspect history | AC-01 to AC-04, AC-06, AC-11 to AC-13, AC-16, AC-19 |
| Admission and execution contracts | Missing prerequisites/session/skill, mode and approval blockers, busy race with ordinary input, queue preservation, duplicate start, response/event reordering, unrelated turns, stale revisions, targeted cancellation | AC-02, AC-05, AC-07 to AC-10, AC-15 |
| Persistence and recovery | Two projects, retained runs, concurrent creation, roundtrip over existing data, renderer reload, runtime restart without replay, malformed/future versions, unavailable bindings | AC-06, AC-10, AC-14, AC-18 to AC-20 |
| Panel and artifact interaction | Navigation while executing, panel reopen, actionable blockers, accessible/localized actions, revision-associated references, missing files, path escape rejection | AC-07, AC-09, AC-11, AC-16, AC-17, AC-20 |

### Prior art and test environment

Reuse the existing queue pending-action tests' controlled admission promises and
public slice/component observations. Existing Work Panel tab tests establish
retained context and tab behavior. Host runtime service tests provide concrete
turn identity, cancellation, and terminal-outcome fixtures. Existing host
project-group and kv repository tests establish persistence and legacy identity
patterns. These are starting points, not evidence that the new feature already
has coverage; implementation must extend and actually run the relevant tests.

Use fixed identities, controlled clocks, and explicit synchronization for race
cases. Include fast stage-rule regression tests, but do not use them as a
substitute for the representative user path. Component interaction tests must
exercise actions; static markup alone is insufficient.

Run shared/desktop type checks, affected tests, and lint when implementing.
Host changes additionally require applicable Rust formatting, tests, and clippy.
Use targeted fixture-based candidate E2E for real admission, event correlation,
and restart boundaries that lower layers cannot prove. Record candidate and base
revisions and synchronize the existing E2E scenario documentation during
implementation. Do not run verify:ui:* or use the user's running Desktop or paid
providers by default. Reuse compatible installed tooling and dependencies;
isolate mutable test profiles and artifacts.

This specification-only task requires local link, fact, encoding, and diff
verification. Runtime tests are not required to claim the document finalized;
no runtime acceptance is claimed until implementation and checks pass.

## Out of Scope

- Additional agent engines, multi-agent orchestration, adapters, factories, buses, or another Pi runtime.
- Reimplementing sessions, context, compaction, tools, shell execution, models, or providers.
- Configurable workflow definitions, DSLs, automatic progression, prompt replay, or automatic retries.
- Full ticket management, Kanban, automatic Ticket-to-Implement scheduling, or inferred progress counts.
- Artifact scanning, content verification, automatic artifact generation outside Pi, or a review parser.
- Automatic Review acceptance, rule edits, skill edits, or environment changes through Retro.
- Reorganizing upstream source, unrelated refactors, dependency upgrades, installation repair, or restoring upstream official CI/release/signing workflows.
- Workflow export/import, automatic identity migration between unrelated projects, and deletion of historical runs or artifacts.
- Commit, push, pull request creation, deployment, and application launch in this specification task.

## Further Notes

- Canonical terminology is in the [domain glossary](../../../../CONTEXT.md); durable ownership and acceptance rationale are in [ADR 0314](../../../adr/0314-engineering-workflow-ownership-and-acceptance.md).
- The factual discovery baseline was remote main at revision 51c839596. Implementation must refresh its own task branch against current remote main rather than assume that snapshot remains current.
- At that baseline, the native built-in skill catalog contained plugin-development and imagegen, not the six engineering skills. Registry metadata alone cannot make the workflow executable; verify installed project/user/plugin skills through existing discovery.
- The live code used database schema version 21 while older baseline prose referenced earlier versions. Verify executable contracts and migrations before changing persistence.
- The authoritative repository policy requires explicit user authorization before committing or pushing, despite contradictory older delivery prose. Finalizing a spec does not itself authorize either operation.
- The configured tracker is GitHub Issues in yuqiangdede/mattpocock-PI with the five canonical triage labels. Implementation tickets #5-#10 are published with ready-for-agent and native blocking relationships. The repository specification is not a separately published parent issue.
- User confirmation in the future product is independent of this interview's instruction to accept design recommendations automatically. The product continues to require explicit stage acceptance.
- No application behavior, IPC implementation, runtime, or stored user data changes as a result of finalizing this specification.
