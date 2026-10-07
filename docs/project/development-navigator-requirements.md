# Development Navigator Requirements Discovery

Date: 2026-10-07
Status: Q1–Q24 and the multi-turn activity refinement accepted by the user.
This document records requirements discovery, not implementation authorization.

## Accepted scope — round one

- Primary user need: reduce repeated context explanation between engineering
  actions. Secondary need: recover prior work and locate its results.
- First-release scope: the current conversation. No separate development-task
  creation or cross-conversation project aggregation is required.
- Record user-initiated Skill submissions from both Launcher buttons and manual
  slash invocation. Agent-internal Skill calls are not separate navigation items
  in the first release.
- Provide recent execution status, verifiable result/file links, and two to four
  optional follow-up actions. An unidentified result remains explicitly unknown.
- Follow-up selection prepares an editable draft; explicit Send executes it.
- Do not add stage locks, completion percentages, or automatic advancement.

## Accepted records and handoff — round two (Q5–Q8)

- Name a record after the submitted engineering request, not an unproven Skill
  execution. Distinguish waiting, running, normal termination, failure, and
  cancellation. Mark actual Skill use only when supported by execution evidence.
  Normal termination does not imply engineering acceptance or Review approval.
- Associate the final response first, then files and validation results supported
  by evidence from that execution. Uncertain file associations are marked for
  verification. Users may add or remove associations; do not scan the entire
  project to guess artifact ownership.
- Preparing a follow-up carries selected result references and a short summary
  into an editable Composer draft. Users may inspect, edit, and remove them.
  Do not duplicate the whole existing conversation. A file reference does not
  establish that its current contents have been read.
- Use `ask-matt` to generate context-sensitive follow-up suggestions rather than
  relying solely on fixed Skill-to-Skill rules.

## Accepted recommendation interaction — round three (Q9–Q12)

- Invoke `ask-matt` only when the user requests next-step suggestions. Do not
  invoke it automatically after every execution.
- Navigation analysis may read relevant evidence and return two to four actions
  with reasons, or explain insufficient evidence. It must not modify files, run
  builds/tests, commit code, or execute recommended actions. These constraints
  belong to the navigation invocation, not merely its Skill label.
- Center analysis on the selected engineering activity and its requests, responses,
  file associations, and validation evidence. Select the latest record by default.
  Display the recommendation basis. For older records, distinguish historical
  results from current file contents.
- Show suggestions in the navigation area with an action name, short reason,
  Prepare draft control, and access to the complete analysis. Generation can be
  cancelled and failures retried without losing the underlying execution record.
- Selecting a suggestion prepares a draft; explicit Send remains required.

## Accepted surface and lifecycle — round four (Q13–Q16)

- Add an optional Navigator tab to the existing Work Panel. Keep Chat and
  Composer in their existing locations. Show recent records, selected results,
  and suggestions without a separate home screen, task-creation form, or modal.
- Persist records, result associations, and generated suggestions with the
  conversation. Show suggestion generation time and do not automatically refresh
  suggestions after restart. An execution with an unverified terminal state is
  shown as unresolved; do not infer failure or automatically retry it.
- One actual submission produces one underlying request record, including all
  explicitly requested Skills. Navigation groups requests into engineering
  activities as specified below. Do not invent independent per-Skill lifecycles
  or duplicate results; actual-use evidence can be associated with individual Skills.
- Request suggestions only while the current conversation is idle. While busy,
  users may inspect history and prepare drafts. Do not open a hidden conversation,
  steer the active execution, or automatically queue navigation analysis.

## Accepted recommendation safety — round five (Q17–Q20)

- Retain old suggestions. When new work is submitted in the conversation, mark
  previous suggestions as potentially outdated and offer explicit regeneration.
  Do not claim freshness when file changes cannot be reliably observed.
- Prefer currently available engineering actions. Keep an unavailable suggested
  Skill visible with its reason and existing settings entry; do not install,
  enable, or substitute it automatically. Recheck availability when preparing
  the draft.
- Save Navigator-triggered `ask-matt` attempts as navigation analyses under the
  selected record, separate from the main execution list. Explicit user slash
  submissions of `ask-matt` remain ordinary recorded Skill requests.
- Preparing a suggestion preserves existing Composer text and attachments and
  appends editable action/context content without sending. Async results remain
  associated with the originating record; project or conversation switches must
  not write into a different draft or navigate the user back automatically.

## Accepted data boundaries — round six (Q21–Q24)

- Determine activity initiation from the actual submission, not earlier button
  selection. Ordinary submissions do not create new Skill activities; follow-up
  answers may belong to an existing activity. New work can make recommendations
  outdated. Empty navigation
  explains how records appear and retains access to the Launcher.
- Users may hide and restore records without deleting source messages, files, or
  execution history. Removing a file association removes only the association.
  Conversation deletion applies existing conversation-deletion rules to navigation
  data; do not retain additional copies.
- Before requesting analysis, offer an expandable input preview showing the
  selected request, response, and file references. Users may deselect files.
  Do not automatically include other conversations or scan the entire project;
  expanding read scope requires explicit user selection.
- Analysis uses the current conversation's model and permissions without
  bypassing approval. Cancellation or failure retains earlier suggestions;
  retries are explicit.

## Accepted multi-turn refinement

This refinement supersedes any interpretation of Q15/Q21 that renders every
submission as a separate main navigation item.

- The main navigation unit is an Engineering Activity, which may contain several
  submissions and Agent responses. Preserve underlying request/turn identities,
  actual-use evidence, and individual execution outcomes within that activity.
- A requirements discussion's questions, user answers, and follow-up rounds
  remain within the same activity. Ordinary answers need not repeat a Skill marker.
- Agent turn termination is not activity completion. Do not prompt for next steps
  or invoke `ask-matt` after every response.
- The user explicitly marks the activity ended when the discussion/work has
  reached a conclusion. This is a navigation boundary, not specification approval,
  Review approval, or acceptance of engineering correctness. Further discussion
  remains possible.
- After ending an activity, the user may explicitly request `ask-matt` suggestions
  based on the multi-turn activity and selected evidence. Ending alone never
  invokes analysis or dispatches another action.
- Bind continuation and activity boundaries explicitly; do not infer that every
  later message in the conversation belongs to the same activity merely because
  it is recent. Exact grouping and continuation controls require technical design.

Representative path: Discuss requirements → several question/answer rounds →
user marks discussion ended → optionally requests suggestions → selects a
follow-up action → reviews the draft → explicitly sends.

## First-release acceptance scenarios

| ID | Observable outcome |
| --- | --- |
| NAV-01 | Actual button/manual slash submissions initiate activities; unsent selections do not. Ordinary answers can continue an existing activity without initiating new Skill activities. Editing away the Skill marker prevents false attribution. |
| NAV-02 | A real submission proceeds through recorded execution outcomes; normal termination never claims engineering completion or Review approval. |
| NAV-03 | Users inspect results, preview analysis inputs, request suggestions, and prepare a follow-up draft with selected context. Existing draft text and attachments survive; execution requires Send. |
| NAV-04 | Multi-Skill submissions remain one record. Failures, cancellation, missing files, and unavailable Skills remain explicit without invented results or automatic remediation. |
| NAV-05 | Busy conversations cannot start or silently queue analysis. Duplicate requests, cancellation, failure, and explicit retry do not duplicate execution or lose earlier suggestions. |
| NAV-06 | Conversation/project switching never reassigns records, opens another conversation's results, or writes into its draft. Restart restores history without replay or inferred terminal outcomes. |
| NAV-07 | New work marks old suggestions potentially outdated. Analyses retain their selected-record basis and generation time; Navigator analyses do not recursively populate the main list. |
| NAV-08 | Hiding/restoring records and removing associations preserve source data. Conversation deletion follows existing policy without navigation-only retained copies. |
| NAV-09 | Analysis reads only the explicitly selected scope through existing permissions; it cannot modify files, run builds/tests, commit, or execute recommendations. |
| NAV-10 | A multi-round requirements discussion stays one activity with inspectable request outcomes. No per-response next-step prompt or automatic analysis occurs. Only explicit activity ending and a separate user analysis request advance the navigation interaction; further discussion remains possible. |

Use component/user-path integration tests for the end-to-end navigation sequence,
contract tests for attribution and recommendation data, and lifecycle tests for
restart, cancellation, duplication, and ownership. Add targeted process tests
where lower-level tests cannot prove the boundary. Do not use real paid models
as default tests or run `verify:ui:*` without explicit task authorization.

## Implementation questions to resolve before coding

These are technical feasibility gates, not unsettled product choices:

- Establish submitted Skill intent and actual-use evidence without treating
  button selection as execution. Reuse native submission and turn ownership.
- Define explicit activity initiation, continuation, ending, and renewed
  discussion with unambiguous ownership, including interleaved unrelated chat.
- Define validated recommendation output with stable Skill references, reasons,
  source associations, insufficient-evidence outcomes, and safe malformed-output
  handling. Generated text cannot authorize execution.
- Verify how the native execution path can enforce analysis-only tool access and
  selected read scope. Prompt wording alone does not prove enforcement. If this
  requires frozen architecture or permission changes, return with alternatives
  and an ADR proposal before implementation.
- Define Host-owned conversation persistence, additive compatibility, deletion,
  and terminal-state reconciliation. Do not repurpose legacy Workflow stages.
- Obtain evidence-backed result references and truthful validation status. Model
  claims remain distinguishable from independently observed verification.

## Delivery boundary

Final confirmation settles this requirements document, not authorization to
implement, commit, push, merge, or publish. Stage three's project-wide version
selection, acceptance chains, and historical decision tracing remain out of scope.

## Current implementation facts

The Launcher prepares editable drafts rather than execution records. Native
requests and events expose conversation/turn identities and execution outcomes,
but there is no general Skill artifact manifest. Button selection therefore
cannot establish actual Skill use or artifact ownership. These facts constrain
the design; they do not authorize a new execution path or Runtime modification.
