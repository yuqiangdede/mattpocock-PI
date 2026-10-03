# Coding Home Interaction Design

Date: 2026-10-02
Status: Interaction decisions Q1-Q12 accepted; requirements consolidated in the [product specification](../spec/01-product/coding-workbench-free-tasks.md).
Audience: Developers using PI-Desktop for coding work.
This document describes proposed interaction, not shipped behavior.

## Confirmed decisions

1. The home surface is a coding workbench with prominent skill cards.
   Keep project context above the cards and the composer below them.
2. Show requirement discussion, specification, ticket splitting and
   implementation together; show project initialization, bug diagnosis
   and retrospective as common actions. Retain code review as an additional
   visible action after implementation in the suggested journey.
3. Cards show a short purpose and an explicit launch action. Clicking opens
   a lightweight task panel with project context and relevant inputs.
   Execution starts only when the user selects Start.
4. Free Task is the default. Every skill is available in any order:
   a simple request can go directly to implementation. Suggested order
   must never impose stage prerequisites on free tasks.
5. Initialization supports creating a project and adopting an existing
   project. Inspect directory and stack, propose a selectable checklist
   for conventions, skills, startup and verification, then execute the
   selected items while preserving existing configuration.
6. Keep Coding Tools accessible from the conversation header. By default,
   launch the selected skill in the current conversation with existing
   context; offer a new task conversation for isolation. Show selected
   documents and tickets before launch.
7. Retain the existing optional Full Engineering Workflow with explicit
   acceptance and prerequisite gates. Free tasks record independent
   results and do not automatically complete formal workflow stages.
8. Every action requires only a plain-language task description. Documents,
   tickets and logs are optional. Direct implementation requires neither
   a specification nor a ticket; the skill asks follow-up questions when needed.
9. While a conversation is busy, users may prepare another action. At launch,
   offer waiting for the current task or executing in a new conversation.
   Code changes in concurrent conversations use separate worktrees.
   Running tasks expose Stop; failures retain inputs and visible error details
   with an explicit Retry action.
10. Present results as a card containing completed work, changed files or
    artifacts, verification results and remaining items. Offer Continue and
    related skills without requiring a next step. Pass relevant artifacts to
    the next task, with a preview and removal controls before launch.
11. Initialization previews files as Add, Modify or Keep. Existing files
    default to Keep; selected modifications expose a diff. Partial failures
    report completed and failed items and allow retrying failed items while
    preserving original user content.
12. Missing or disabled skills and missing model configuration remain visible
    on cards. Explain the blocker and provide the appropriate Install,
    Enable or Configure action. Retain the task draft during remediation.
13. Use multiple card columns in wide windows and a single column in narrow
    windows. The task panel changes from a side panel to a full-width view.
    Conversations retain Coding Tools and Back to Workbench. Navigation does
    not stop execution. All actions support keyboard use and text status.

## Page composition

```text
Project name / directory / project selector
Coding Workbench                    [Full Engineering Workflow]

Suggested journey (all actions independently available)
[Discuss requirements] [Form specification] [Split tickets] [Implement]

Common actions
[Initialize project] [Diagnose bug] [Review code] [Retrospective]

Current task / latest result / optional next actions
Existing chat composer
```

Each card has a localized action name, one short purpose sentence and a
visible launch button. Display skill identity in the task panel, rather than
requiring users to know slash commands. A suggested next action is a visual
recommendation, never a prerequisite lock. Actual execution blockers such
as missing skill, project or model are explained separately.

The project selector and existing composer retain their current purposes.
Unfinished first-use setup remains discoverable without replacing skill
cards. If no project is selected, retain the draft while offering project
creation or selection before project-bound execution.

## Task panel

Order fields as: action title and purpose, project context, task description,
optional context attachments, conversation destination, then Start.
Only the task description is a required content field. A project-bound
action additionally needs its execution directory; this is an execution
prerequisite, not an engineering-stage prerequisite.

| Action | Description prompt | Optional context | Expected result |
| --- | --- | --- | --- |
| Initialize project | What are you building or preparing? | New/existing project, stack preferences | Selected setup items, file preview, startup and verification instructions |
| Discuss requirements | What problem should this solve? | Existing notes, constraints | Clarified requirements and unresolved questions |
| Form specification | What should be specified? | Discussion, existing requirements | Specification with acceptance criteria |
| Split tickets | What work should be broken down? | Specification, constraints | Coherent tickets and dependencies |
| Implement | What change should be made? | Ticket, specification, relevant files | Code changes, verification and remaining work |
| Diagnose bug | What is failing? | Reproduction steps, logs, affected files | Evidence, root cause or unresolved hypotheses, fix and checks where possible |
| Review code | What change should be reviewed? | Diff, branch, intended behavior | Findings with locations, impact and validation limits |
| Retrospective | What work should we reflect on? | Results, decisions, failures | Lessons and actionable improvements |

Optional prompts must not become mandatory forms. Skills may ask for
clarification in the conversation. The direct-implementation adapter must
accept a plain-language request even if the installed `implement` skill
normally assumes ticket-oriented intake; implementation must verify and
address that mismatch rather than merely removing a UI lock.

## Execution and navigation

```text
Card -> Draft -> prerequisite check -> Start -> Running
                                     |           |
                                  Blocked    outcome reported
                                     |           |
                              remedy + Draft   Result
                                                 |
                               Continue / Retry / another skill
```

Waiting for a busy conversation must be visibly pending, with a way to
withdraw before admission. It must not start duplicate attempts. Starting
in a new conversation carries only the context previewed by the user.
Stop remains pending until cancellation is acknowledged; failure to cancel
stays observable. A failed, cancelled or interrupted attempt does not
claim successful completion. Retry is explicit and retains the prior result.

Project and conversation switches do not reassign an active task. Back to
Workbench shows project-owned task status without cancelling work. The
optional formal workflow remains a separate surface with its existing gates.
There is no automatic conversion of a free-task result into stage acceptance.

## Result card

Show task identity and outcome, completed work, file/artifact links,
verification results with their actual status, and remaining items. Failed
tasks additionally show an actionable error and Retry. Keep artifact handoff
explicit: the next task draft previews inherited references and allows removal.
Opening the next task panel does not execute it.

## Initialization interaction

1. Select Create new project or Adopt existing project and its directory.
2. Inspect existing files and detected stack without modifying them.
3. Present selectable setup items: conventions, skills, startup and verification.
4. Preview exact Add/Modify/Keep files; existing files default to Keep.
5. Execute selected items after explicit start and retain per-item outcomes.
6. Show completed/failed items; retry only failed selected work after checking
   current files again. Never restore old snapshots over subsequent user edits.

The initialization composition is an implementation dependency, not an
existing complete Matt Pocock skill. Its concrete adapter and contract need
design before coding; any public ownership or persistence change requires
the repository's appropriate ADR process.

## Responsive and accessible behavior

Cards follow the documented reading order when stacked. Use existing shared
UI primitives, localized labels and accessible names. State must be legible
without color or icons. Opening the task panel moves focus into it; closing
returns focus to the originating action and preserves draft input. Keyboard
users can reach every card, attachment control and execution action. Keep
the composer and task actions usable without horizontal scrolling.

## Suggested handoff actions

| Result | Optional next actions |
| --- | --- |
| Requirement discussion | Form specification; Implement directly |
| Specification | Split tickets; Implement directly |
| Implementation | Review code; Diagnose bug; Retrospective |

Suggestions do not start an execution or accept a formal workflow stage.

## Existing behavior and implementation anchors

- Home surface (`apps/desktop/src/components/ChatSurface.tsx`):
  empty conversations show mascot, project title, onboarding and composer;
  conversations with messages switch to session panes.
- [Stage contracts](../../packages/shared/src/types/workflow.ts):
  Discovery, Spec, Tickets, Implement, Review and Retro.
- [Current workflow spec](../spec/01-product/engineering-workflow-v0.md):
  strict stage acceptance remains authoritative for formal workflow runs.
- Existing glossary (`CONTEXT.md`): Workflow Run and Stage Completion
  remain distinct from free tasks and skill execution.

## Action mapping

| Action | Skill or composition |
| --- | --- |
| Discuss requirements | `grill-with-docs` |
| Form specification | `to-spec` |
| Split tickets | `to-tickets` |
| Implement | `implement` |
| Review code | `code-review` |
| Diagnose bug | `diagnosing-bugs` |
| Retrospective | `retro` |
| Initialize project | No complete `init-project` skill currently exists; composition remains to be designed |

## Acceptance scenarios for implementation

1. From a selected project, implement a plain-language request without a
   specification or ticket, inspect its result and open code review with
   previewed artifacts.
2. Start any free action out of suggested order; no formal stage prerequisite
   blocks it, and no formal workflow acceptance changes.
3. Switch skills inside a conversation with context; choose a new conversation
   and verify only explicitly previewed context transfers.
4. Prepare a draft while busy, withdraw waiting work or launch in another
   conversation; duplicate execution and shared-worktree code writes are prevented.
5. Stop, fail and retry a task; inputs and previous outcomes survive navigation,
   and interrupted work is not silently replayed.
6. Initialize an existing project with conflicting files; Keep is default,
   changes are previewed, and partial retry preserves user edits.
7. Resolve missing skill/model blockers without losing the draft or replacing
   a user-disabled skill silently.
8. Use all actions at narrow width and with keyboard only; verify focus,
   readable status, navigation and a running task surviving Back to Workbench.

## Handoff and remaining technical work

Q1-Q12 are resolved. Review this consolidated design before implementing.
Inspect concrete skill contracts, initialization composition, task ownership,
busy-session admission, draft/result persistence and history availability
before selecting implementation boundaries. These are technical investigation
items, not undecided user interaction choices. Do not claim existing execution
or history supports a feature until verified. Keep the current strict workflow
spec unchanged until a separate additive free-task specification is implemented.

## Design-stage validation boundary

This round changes design documentation and glossary only. No runtime,
workflow contract, persistence schema or UI has been changed. Before
implementation, synchronize the applicable product and E2E specifications
and establish user-path tests for direct implementation, arbitrary skill
order, context handoff, initialization safety and formal-workflow isolation.

The subsequently authorized implementation is recorded in
[the task-candidate delivery report](coding-workbench-delivery.md). The paragraph
above describes the earlier design-only round, not the current implementation.
