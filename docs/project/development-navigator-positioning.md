# Stage 2 Development Navigator — Matt Pocock Skills + Work Item

> Updated: 2026-10-10
> Status: Product direction decided; implementation and acceptance remain planned.
> Project: [mattpocock-PI](https://github.com/yuqiangdede/mattpocock-PI)
> Design: [Work Item grouping and standalone page](development-navigator-work-items.md)
> Authority: [Development Navigator product specification](../spec/01-product/development-navigator.md). This document records positioning and rollout rationale; the specification governs product requirements.

## 1. Product positioning: continued development with one Skills family

**Stage two initially uses Matt Pocock Skills only, with Work Item as the durable unit of organization across conversations.**

Stage-one Skill Launcher makes an engineering Skill easy to invoke. Stage-two Navigator helps users continue one development goal across native Pi conversations, find documents and recover progress.

- **One method family:** organize [Matt Pocock Skills](https://github.com/mattpocock/skills); Superpowers / ECC are neither required nor default execution frameworks.
- **Work Item as the organizing unit:** an explicit requirement, bug or refactoring goal has an optional Work Item linking native Sessions. AI does not guess membership from transcripts.
- **Standalone page first:** deliver grouping, conversation navigation, artifact references and recovery before native sidebar changes or general graph editors.
- **Native Pi Runtime:** reuse PI-Desktop Host-owned sessions, queues, tool permissions, cancellation and recovery; the Agent Runtime executes agents through existing Pi capabilities. Preserve existing model, command and Git paths.
- **No enforced workflow:** users may enter diagnosis, review, implementation or discussion directly. Existing Specs/Tickets remain usable later; a finished Turn does not complete the engineering goal.
- **Extension first:** follow [AGENTS.md](https://github.com/yuqiangdede/mattpocock-PI/blob/main/AGENTS.md). Prefer independent modules, plugins, existing APIs and additive data models; organizational features must not change core lifecycles.

The value is durable development goals and engineering context across conversations, rather than additional Skill buttons.

## 2. Matt Pocock capability set

| Activity | Preferred Skills | Usage and boundaries |
| --- | --- | --- |
| Engineering Skills setup | `setup-matt-pocock-skills` | Configure the issue tracker, triage labels and domain docs as needed; not Pi project creation or replacement of Host initialization |
| Requirements and decisions | `grill-with-docs` | Discuss scope, constraints and terminology over multiple rounds |
| Specification | `to-spec` | Produce a Spec from discussion, publish through the configured tracker and register the result with the Work Item |
| Task breakdown | `to-tickets` | Produce tickets and blocking dependencies from Spec/discussion; no mandatory separate detailed-planning stage |
| Daily development | `implement` | Develop from selected Specs/Tickets with `tdd`, tests and `code-review` as needed; commits obey project Git and permission rules |
| Large requirements (later evaluation) | `implement-spec` | Subagents, branches/worktrees and merges require compatibility review against repository isolation rules and Pi capabilities; not an MVP default |
| Bug diagnosis | `diagnosing-bugs` | Reproduction, root cause, fix and regression whenever needed |
| TDD and review | `tdd`, `code-review` | On demand; user/model invocation follows actual Skill invocation restrictions |
| PR and retrospective | `pr`, `retro` | PR descriptions and retrospectives; actual commits/PR operations follow native Git and project rules |
| Handoff aid | `handoff` | Compact context pointers; temporary files cannot become durable Work Item state |

At use time, verify installation, activation and required Pi invocation capabilities. Report unavailable capabilities; never switch frameworks automatically or fabricate successful execution.

Stage two excludes Superpowers / ECC installation, hooks, memory, cross-framework routing, artifact conversion and compatibility layers. Revisit a missing Matt capability only with explicit needs and independent validation.

## 3. Work Item and native Session references

One Work Item focuses on one goal and links multiple existing Sessions:

```text
Project (existing Pi project identity)
  |-- Native Session A
  |-- Native Session B
  |-- Native Session C
  |
  +-- Navigator / Work Items (additional view)
       +-- Work Item: user login
            |-- reference -> Session A (grill-with-docs / to-spec)
            |-- reference -> Session B (to-tickets)
            |-- reference -> Session C (implement)
            +-- artifact references: Spec, Tickets, Review
```

MVP membership rules:

1. Create conversations through native Pi; link only after receiving the confirmed Session ID.
2. Normal chat creation stays ungrouped and freely supports Skills.
3. Attaching, moving or detaching historical conversations requires explicit user action. AI may suggest but never move or split history itself.
4. Each Session has at most one primary Work Item in its owning Project; one Work Item can link many Sessions.
5. Deleting, archiving or completing a Work Item neither deletes chats nor ends running Pi tasks. Native Session/Project deletion retains the existing Host lifecycle.

**Work Item holds references and additive engineering metadata; it does not own Sessions.** See [the design](development-navigator-work-items.md) for error, permission, recovery and interaction constraints.

## 4. Standalone Navigator page and MVP

Implement an optional workspace in a standalone page before changing the native sidebar.

| Area | Initial scope | Deferred scope |
| --- | --- | --- |
| Work Item list | Create, rename, archive, select, project-scoped query | Automatic AI clustering |
| Conversations | Native creation, attach/detach, open native chat | Transcript merging or Session-storage rewrite |
| Artifacts | User-selected Spec/Tickets/Review file or Issue references with sources/versions | Scanning that guesses which Skill generated a file |
| Progress | Recent activity, linked artifacts, pending confirmations, recent Session state | Mandatory stage machine or complex graph editing |
| Ordinary chat | Ungrouped conversations remain usable | Mandatory grouping |

First verify that Plugin SDK / Work Panel and native Session APIs safely support discovery, opening and associations. If insufficient, use independent Navigator modules and minimal Host-owned interfaces without widening permissions.

First perform [stage-one plugin feasibility validation](skill-launcher-plugin-feasibility.md). Available interfaces do not prove draft/catalog/config migration parity. Preserve the current native Launcher until validation passes.

## 5. Cross-conversation handoff: Spec → Tickets → Implement

The first required real sequence:

1. Session A discusses requirements through `grill-with-docs`, produces a Spec through `to-spec`, and the user registers/confirms its exact source and version.
2. Session B selects that Spec in the same Work Item and uses `to-tickets` to generate task files or tracker records; link tickets and actual dependencies.
3. Session C selects designated Specs/Tickets and develops through `implement`, with `tdd` / `code-review` as needed.
4. Restart the app; the Work Item still locates Sessions, document versions and known states so work continues.

Artifacts may reside in project Markdown, the tracker or existing Host Plan paths. Navigator records references without requiring a new Matt-specific format. Retain at least type, Work Item, actual source (file or Issue URL/ID), content version/hash, registering actor/execution ID where available, confirmation state and availability.

- Before handoff, verify file existence, matching version and confirmation; flag invalid/inaccessible inputs rather than using old content silently.
- `to-tickets` tickets/blocking relationships are one task-domain source; do not create a competing complete task state machine.
- `handoff` is optional and writes temporary output by default; it cannot replace durable Spec/Ticket references, membership or Host state.
- A shared Work Item does not send all linked transcripts to another model. Users select necessary context under Pi file/tool permissions.
- Executable operations require explicit user triggers. Draft preparation, artifact discovery and suggestions never automatically submit requests.

## 6. Recovery and verifiable execution evidence

| State | Authority | Initial presentation |
| --- | --- | --- |
| Work Item | Host-owned durable Navigator metadata | Active/completed/archived; explicit user completion |
| Session / Turn | Native Pi / Host | Actual waiting/running/ended/failed/cancelled/unknown |
| Artifact | Verifiable file/Issue content and human confirmation | Pending/confirmed/changed/unavailable |
| Ticket (later) | Configured tracker or explicitly user-managed data | Reference actual state without competing with the tracker |

- Session/Turn success does not prove Work Item completion, Spec approval or passing tests.
- Agent claims are model reports, distinct from tests, commits and user acceptance. Link evidence to native sessionId/turnId, tool results and verifiable sources.
- Restore associations/references on restart; unfinished execution is interrupted/unknown. Never automatically replay tools or prompts.
- PR #53's session-level Engineering Activity is observational, not a cross-session Work Item. Evaluate legacy V0 persistence/recovery reuse without inheriting six-stage locks.
- Spec updates flag related Tickets/implementation for review; preserve history and confirmed content.

## 7. Delivery slices and acceptance

| Order | Delivery | Required validation |
| --- | --- | --- |
| 0a. Stage-one plugin feasibility | Restricted POC for plugin `composerControl`, native Skill Catalog/drafts; input, attachments, config, Session changes | Preserve Runtime/manual Send; retain Launcher if parity fails; see [feasibility gate](skill-launcher-plugin-feasibility.md) |
| 0b. Navigator adapters | Safe native Session listing/opening through plugin/Navigator/Host | No privilege widening, Runtime changes or invented APIs |
| 1. Work Item MVP | Optional grouping, native creation/attach/detach, standalone page, durable recovery | Ordinary chat unchanged; group deletion preserves chats; no unauthorized cross-project links |
| 2. Matt artifact handoff | Spec → Tickets → Implement with source/version/confirmation/availability | Continue across three Sessions without full transcript copying; invalid inputs never silently continue |
| 3. Lightweight tasks/evidence | Authoritative Ticket states, Pi Turns, test/Review/Commit evidence | Separate task/execution state; failures/interruption/unknown never appear complete |
| 4. Optional enhancements | Change impact, graphs, review history, long-term memory | Real-use driven; not prerequisites |

MVP excludes a complete workflow engine, cross-framework scheduling, independent Runtime, mandatory stage order, complex graph canvas and automatic memory learning.

## 8. Existing capabilities and stage three

- **Stage-one Launcher:** preserve optional Coding Action → native Skill draft → manual Send, independent of grouping.
- **[Issue #46](https://github.com/yuqiangdede/mattpocock-PI/issues/46):** existing session-level activity/analysis scope stays unchanged.
- **[PR #53](https://github.com/yuqiangdede/mattpocock-PI/pull/53):** independent review/acceptance; this plan neither adds grouping to its code scope nor claims it shipped.
- **Stage-three Engineering Control Surface:** strengthen cross-item decisions, audits, graphs and multi-framework extensions only when demonstrated needs warrant them.

Stage-two success means linked conversations reliably find the same confirmed Specs/Tickets, show current progress and safely continue work.
