# Development Navigator — First Release

> **镜像说明：** 本页对应 [英文源规格](/spec/01-product/development-navigator)。当前正文保留英文，以源规格为准；本页不宣称已经完成中文翻译。

Date: 2026-10-07
Status: Product requirements and primary test seam accepted by the user.
Scope: Conversation-scoped navigation around native engineering Skills.

Published specification: [GitHub #46](https://github.com/yuqiangdede/mattpocock-PI/issues/46).
Implementation tickets: #47–#52, all labeled ready-for-agent.

## Problem Statement

Developers can invoke engineering Skills, but must repeatedly recover prior
results, locate supporting files, and explain context when moving between
requirements, design, implementation, and Review. A rigid stage model introduces
additional state maintenance and does not reliably reflect actual work.

One engineering effort can span many question/answer rounds. A completed Agent
reply does not mean the effort has ended or its outputs have been accepted.
Navigation that reacts to every reply interrupts work and misrepresents progress.

## Solution

Provide an optional Navigator tab in the existing Work Panel, scoped to the
current conversation. Keep Chat, Composer, and independent Coding Actions intact.
Show Engineering Activities, associated results and evidence, and explicitly
requested next-step suggestions. An activity contains multiple user submissions
and Agent responses, with inspectable underlying execution outcomes.

The user explicitly ends an activity, then may request analysis-only `ask-matt`
suggestions while the conversation is idle. Suggestions explain their basis and
prepare editable follow-up drafts. Only explicit Send executes a follow-up.

Representative journey: launch requirements discussion → several question/answer
rounds → inspect results → mark the activity ended → preview analysis inputs →
request suggestions → select an action → edit the inherited context → Send.
Neither turn termination nor activity ending approves requirements or Review.

## User Stories

1. As a developer, I want navigation scoped to my current conversation, so that unrelated work is not mixed into my context.
2. As a developer, I want an optional Work Panel tab, so that navigation does not replace Chat or Composer.
3. As a developer, I want independent Actions to remain available, so that suggestions never restrict my choice.
4. As a developer, I want actual button and manual slash submissions recognized equally, so that my invocation method does not change history.
5. As a developer, I want unsent or edited-away Skill selections excluded, so that history reflects submitted intent.
6. As a developer, I want requested Skills distinguished from observed Skill use, so that records do not invent execution evidence.
7. As a developer, I want multiple Skills in one submission represented together, so that results are not duplicated.
8. As a developer, I want a multi-round discussion shown as one Engineering Activity, so that history reflects meaningful work.
9. As a developer, I want ordinary answers to continue that activity without another slash marker, so that discussion remains natural.
10. As a developer, I want unrelated messages kept outside the activity unless explicitly associated, so that attribution remains trustworthy.
11. As a developer, I want underlying requests and outcomes inspectable, so that failures are not hidden by aggregation.
12. As a developer, I want waiting, running, normal termination, failure, cancellation, and unresolved outcomes distinguished, so that execution status is truthful.
13. As a developer, I want no next-step prompts after individual replies, so that multi-round work is uninterrupted.
14. As a developer, I want to mark an activity ended myself, so that the system does not guess when discussion is finished.
15. As a developer, I want further discussion possible after ending, so that a navigation boundary does not freeze my work.
16. As a developer, I want ending separate from content approval, so that it does not imply engineering correctness.
17. As a developer, I want final responses accessible as results, so that conclusions are easy to find.
18. As a developer, I want files and validation results associated only with disclosed evidence, so that concurrent changes are not falsely attributed.
19. As a developer, I want unknown results and missing files explicitly identified, so that absence is not disguised as success.
20. As a developer, I want to add or remove result associations, so that I can correct incomplete attribution without deleting files.
21. As a developer, I want next-step analysis only on request, so that I control model use and waiting time.
22. As a developer, I want analysis based on the selected ended activity, so that advice considers the complete discussion.
23. As a developer, I want an expandable input preview and removable file selections, so that I control the analysis scope.
24. As a developer, I want analysis limited to selected evidence and existing permissions, so that navigation does not gain broader access.
25. As a developer, I want two to four suggestions with reasons or an insufficient-evidence explanation, so that advice is actionable and honest.
26. As a developer, I want the full analysis accessible, so that I can examine its reasoning and limitations.
27. As a developer, I want no file changes, builds, tests, commits, or follow-up execution from navigation analysis, so that advice remains analysis-only.
28. As a developer, I want analysis disabled while the conversation is busy, so that it does not steer or silently queue behind my work.
29. As a developer, I want cancellation and explicit retry, so that failed analysis does not lose earlier suggestions or duplicate execution.
30. As a developer, I want navigation analyses nested under their activity, so that they do not become recursive engineering activities.
31. As a developer, I want direct slash invocation of ask-matt treated as ordinary engineering work, so that native Skill use remains consistent.
32. As a developer, I want recommendation timestamps and stale warnings after new work, so that old advice is not presented as current.
33. As a developer, I want unavailable recommended Skills explained, so that the system does not silently install or substitute them.
34. As a developer, I want recommendations to prepare editable action and context drafts, so that I choose what to send.
35. As a developer, I want existing draft text and attachments preserved, so that navigation never overwrites my input.
36. As a developer, I want result references and concise summaries rather than copied conversation history, so that handoff stays readable.
37. As a developer, I want asynchronous results bound to their original conversation and activity, so that switching views cannot misattribute work.
38. As a developer, I want history and suggestions restored after restart without replay, so that continuity does not trigger unexpected execution.
39. As a developer, I want to hide and restore activities without deleting source data, so that I can organize the view safely.
40. As a developer, I want conversation deletion to follow existing retention rules, so that navigation does not retain an extra private copy.
41. As a developer, I want an empty-state explanation and Launcher access, so that navigation remains understandable before the first activity.

## Implementation Decisions

### Domain and attribution

- Engineering Activity is the main navigation unit; Engineering Request Records
  and bound native turns provide underlying execution evidence. Activity ending
  and turn termination are separate concepts. Activity ending is not acceptance.
- Initiation derives from actual submitted Skill intent, not button selection.
  Agent-internal Skill calls do not independently create main-list activities.
  Continuation, renewed discussion, and unrelated-message ownership must be
  explicit and testable rather than guessed from message proximity.
- Aggregate multiple Skill requests without invented per-Skill lifecycles.
  Record actual-use evidence separately from requested identity.
- Associate final responses and evidence-backed files/validation. Distinguish
  model-reported validation from independently observed checks. Uncertain
  attribution remains marked for verification; do not scan the project to guess.

### Navigation analysis and handoff

- Navigation Analysis belongs to the selected ended activity, remains separate
  from its engineering requests, and retains generation time and input basis.
- Invoke the installed native `ask-matt` only on explicit request while idle,
  using the current model and permission system. Do not open hidden sessions,
  steer active work, or silently queue analysis. Duplicate admission and busy
  races must be guarded at the authoritative boundary.
- Apply the installed Skill's method through the existing tool-free one-shot
  analysis capability, resolving the same effective Skill source and current
  conversation model. This is Navigation Analysis, not an ordinary slash turn;
  it does not append an engineering request or load unselected session resources.
- Enforce analysis-only capabilities and selected read scope. Prompt wording
  alone is insufficient proof. No write, build/test, commit, or recommended
  action execution is allowed. Broader reading requires explicit selection.
- Validate generated suggestions as untrusted input, including Skill references,
  reasons, and evidence basis. Malformed output cannot create executable actions;
  preserve diagnosable analysis and offer explicit retry. Insufficient evidence
  may yield no recommendations rather than invented ones.
- Prefer available engineering actions; recheck availability before draft
  preparation. Explain missing/disabled Skills with existing settings access,
  without automatic installation, enablement, or substitution.
- Preserve old suggestions on failure/cancellation and flag potential staleness
  after new work. Historical file references do not establish current contents.
- Prepare concise editable summaries and selected references through existing
  Composer insertion seams. Preserve text and attachments; Send remains explicit.

### Ownership, persistence, and compatibility

- Renderer owns presentation and interaction. Host owns authoritative durable
  conversation-associated navigation state. Main stays a thin orchestrator;
  native agent execution, source resolution, permissions, queues, and cancellation
  remain authoritative. No parallel Runtime or legacy Workflow prerequisite path.
- Use additive, versioned persistence with old-data compatibility, safe handling
  of unknown formats, and conversation deletion semantics. Final schema/storage
  design remains an implementation gate, not a claimed existing contract.
- Bind every asynchronous operation to conversation, activity, and execution
  identity. Navigation changes must not write into another draft or force return.
- Restore persisted activities, associations, analyses, and suggestions without
  automatic refresh or replay. Unverified terminal outcomes remain unresolved
  until native reconciliation establishes their status.
- Hiding is reversible presentation metadata; association removal never removes
  source files. Do not preserve navigation-only copies after conversation deletion.
- All visible copy and accessible labels use existing i18n conventions. Keyboard
  interaction and narrow-panel usability are part of acceptance.

## Testing Decisions

### Primary seam

Use one primary user-path seam at the Navigator/Composer interaction boundary.
Exercise real internal wiring through multi-round discussion, explicit ending,
analysis preview/request, suggestions, draft preparation, and manual submission.
Replace only real external boundaries such as model responses and durable storage
transport. The user accepted this seam with the six-ticket breakdown.

Existing Launcher draft-preservation interaction tests, Work Panel tab/restoration
tests, native event ownership tests, and Host persistence/permission tests provide
prior art. Source-text assertions alone cannot prove the representative journey.
Assert visible results and stable contracts, not private calls or DOM structure.

### Acceptance mapping

| ID | Required behavior and test coverage |
| --- | --- |
| NAV-01 | Submitted button/slash intent initiates activities; unsent/removed markers do not. Ordinary answers continue explicitly bound activities. |
| NAV-02 | Underlying execution outcomes and actual-use evidence are truthful; normal termination never approves work. |
| NAV-03 | Full user journey preserves existing drafts/attachments and requires Send; analysis inputs and handoff context are editable. |
| NAV-04 | Multiple Skills, missing results/files, failure/cancellation, and unavailable Skills remain explicit without fabricated success. |
| NAV-05 | Busy races, duplicate clicks, analysis cancellation/failure/retry never duplicate admission or erase prior suggestions. |
| NAV-06 | Project/conversation/activity switching and restart preserve ownership, history, and unresolved states without replay. |
| NAV-07 | New work flags old recommendations; analyses retain their basis and do not recursively create activities. |
| NAV-08 | Hide/restore, association removal, and conversation deletion obey source-data and retention boundaries. |
| NAV-09 | Permission/contract tests prove read-only analysis and selected scope; malicious or malformed suggestions cannot execute. |
| NAV-10 | Multiple discussion rounds remain one activity. Ending is explicit, continued discussion remains possible, and each reply produces no next-step prompt or automatic analysis. |

Use deterministic events and explicit synchronization for races. Add focused
contract tests for attribution, recommendation validation, persistence, and
permission enforcement, and targeted process E2E where lower layers cannot prove
the boundary. Do not use paid providers or the user's live instance by default.
Do not run `verify:ui:*` without explicit authorization in the implementation task.

## Out of Scope

- Stage locks, fixed execution order, percentages, or automatic advancement.
- Automatic per-reply suggestions, automatic analysis retries, or auto-submission.
- Separate task creation, cross-conversation aggregation, and project-wide tracking.
- Stage-three version approval chains, complete provenance graphs, and rollback.
- Automatic Skill installation or a replacement Skill Loader/Agent Runtime.
- Deleting historical Workflow data or treating it as Navigator state.
- Whole-project artifact discovery or inferred completion from button clicks.

## Further Notes

Current native request/event contracts provide conversation/turn identities and
outcomes, but no general Skill artifact manifest. Attribution, grouping controls,
structured analysis output, enforced read scope, and compatible persistence must
be designed before coding. If the native path cannot enforce analysis-only access
without frozen architecture changes, present alternatives and migration impacts
before implementation and record an ADR when required.

Legacy Workflow ownership decisions describe retained Workflow capabilities;
they do not mandate stage semantics for conversation-scoped Navigator activities.
Existing native Skill fallback/source policy remains unchanged.

Publishing this specification does not authorize implementation, commits, branch
pushes, merging, or releases. The accepted discovery record remains historical
context; this specification becomes the behavior baseline when finalized.
