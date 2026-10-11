# Development Navigator (Planned)

- Date: 2026-10-11
- Status: Accepted product direction; planned contract, not shipped functionality.
- Design: [Stage-two positioning](../../project/development-navigator-positioning.md) and [Work Item design](../../project/development-navigator-work-items.md).

## Product scope

Stage two organizes one engineering goal across several ordinary Pi conversations through an optional project-scoped Work Item. Use Matt Pocock Skills only; Superpowers/ECC routing, a mandatory stage machine, a task graph and a new agent runtime are outside the initial scope. Skill availability and invocation capability must be checked before use; unavailable capabilities must not appear successful.

The initial UI is an independent Navigator page. Preserve ordinary ungrouped chat, the native sidebar and the stage-one Coding Action/Skill Launcher, including when Navigator is disabled. A Work Item supports explicit create, rename, complete, archive, delete and session association actions. Completion requires the user's action; Session/Turn completion never completes the Work Item.

## Ownership and compatibility

Host Core owns durable Navigator metadata. Renderer state is a projection. Host retains authoritative ownership of projects, sessions, transcripts, permissions and queues; Agent Runtime owns agent execution. Reuse existing native Pi APIs and preserve their tool and execution lifecycles. A Work Item references a Session rather than owning it; a Session has zero or one primary Work Item in its current logical project. No silent cross-project attachment or permission widening is allowed.

Creating a conversation uses native session creation and links the confirmed ID. If linking fails, retain the ungrouped Session and offer retry without duplicating the Session or replaying its prompt. Deleting or archiving a Work Item must not delete conversations, files or stop active execution. Native Session deletion reconciles unavailable links; native project deletion follows existing Host policy.

A native Session move to another project must detach or mark its old association unavailable before clickable navigation. Revalidate Host ownership at read/navigation and mutation boundaries; late results must not restore stale membership. Preserve the native move operation's transcript, permission and execution semantics.

When a legacy `legacy:<path>` project group upgrades to a stored UUID, transactionally reconcile Navigator ownership with the confirmed logical identity. Preserve Work Item IDs, session links and artifact references. Interrupted reconciliation must recover safely without duplication or loss; do not use folder-string inference as a substitute for authoritative identity.

Evaluate existing public plugin/work-panel APIs first, then independent modules and narrow Host-owned metadata interfaces. Imported-session plugin access does not authorize reading ordinary conversations. Lifecycle, architecture or security-boundary changes require explicit architecture approval and an ADR.

## Artifact handoff and confirmation

The representative path is Session A discussing requirements and producing a Spec, Session B selecting that Spec for `to-tickets`, and Session C selecting Spec/Tickets for `implement`. Persist actual file/Issue references, exact content hash or source revision, provenance and availability across restart. Human-readable summaries cannot substitute for content versions. A temporary `handoff` output is only a pointer, not durable authoritative state.

Eligible local requirements files reuse [Requirements Confirmation](requirements-confirmation.md). Navigator retains the Host decision ID, root/relative path, SHA256 and history revision; confirmation status is derived from that authoritative record and current content. Re-read and validate freshness before handoff, rejecting changed content or stale decisions. Never create a competing writable approval flag or treat Workflow stage acceptance as content approval.

Unsupported sources, including Issues, need a separately defined and reviewed Host-owned confirmation contract binding the actor and exact source revision before confirmed handoff is enabled. Tracker status and model claims do not imply approval. Changed, removed, inaccessible or unconfirmed inputs remain visible and cannot silently be used as valid confirmed inputs. Preserve historical references when revisions change and prompt review of derived work.

Only explicitly selected, accessible context is handed off; do not inject all linked transcripts. Prepare drafts and suggestions without sending. Explicit Send remains required. Do not automatically dispatch Skills, commit, advance workflow state or replay prompts/tools after recovery.

## Evidence and recovery

Keep Work Item state, native Session/Turn outcomes, artifact confirmation and tracker-owned Ticket state distinct. Link execution evidence to authoritative Session/Turn/tool identifiers where available. Model-written completion claims are reports, not proof of tests, commits or acceptance. Show failed, cancelled, interrupted and unknown outcomes faithfully. Persist metadata and reconcile missing references across reload/restart without replaying execution.

PR #53's session-level Engineering Activity remains subject to independent review and acceptance; it is not a shipped cross-session Work Item. Legacy Workflow records retain their semantics and are not silently mapped to Work Items or their fixed stages imposed on this feature.

## Delivery and acceptance

1. Feasibility: verify existing extension/session-navigation access and the stage-one plugin POC without replacing the native Launcher before validation.
2. Optional grouping: Work Item actions, native session create/link/unlink/open, ungrouped access and durable recovery.
3. Artifact handoff: the three-session Spec → Tickets → Implement path with exact versions and authoritative confirmation.
4. Evidence: native outcomes, review/test/commit references and tracker-owned ticket statuses. Further graphs or memory require demonstrated need.

Minimum regressions must cover ordinary chat with Navigator disabled; multiple linked conversations with original IDs; Work Item deletion without conversation deletion; failed-link retry without duplicate execution; native Session deletion and project moves; project isolation and stale async results; transactional legacy-identity upgrade and recovery; restart without replay; authoritative file-confirmation reuse and changed/stale/unavailable inputs; unsupported-source approval restrictions; Spec revision impact without history deletion; evidence distinct from model claims; and unchanged #46/#53 and legacy Workflow behavior. Implementation issues must specify the lowest meaningful tests for these paths before code changes.
