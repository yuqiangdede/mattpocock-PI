# Development Navigator — Work Item Grouping and Isolated Page (Proposal)

> Date: 2026-10-10
> Status: Product/architecture proposal only; not implemented or accepted as an executable contract.
> Parent: [Stage 2 positioning](development-navigator-positioning.md).
> Principle: **Extension first; preserve PI-Desktop core lifecycles.**

## 1. Problem and decision

The existing Pi Project → Session model is appropriate for chat, while an engineering goal often spans multiple conversations and Skills. AI-based clustering of chat titles or transcripts is not a reliable ownership mechanism.

**Proposed decision:** introduce an optional **Work Item**, a project-scoped grouping and engineering-context container, with explicitly linked existing sessions. One Work Item represents one specific requirement, defect or refactoring goal. A Work Item **references** sessions; it never owns their lifecycle.

A Work Item is more than a cosmetic chat folder: it can later retain referenced Specs, Plans, tasks, run evidence and user approvals. However, these integrations are incremental; grouping is the first deliverable.

## 2. Logical model and boundaries

\`\`\`text
Logical Project Group (existing durable project identity)
  |-- Native Session A (unchanged)
  |-- Native Session B (unchanged)
  |-- Native Session C (unchanged)
  |
  +-- Navigator (optional, independent page)
       |-- Work Item: user login
       |    |-- link -> Session A (requirements)
       |    |-- link -> Session B (plan)
       |    |-- link -> Session C (implementation)
       |    |-- Artifact refs: Spec v2, Plan v1
       |    +-- Later: tasks, execution and evidence
       |
       |-- Work Item: fix remote routing
       |    +-- link -> existing Session D
       +-- Ungrouped sessions (still native Pi sessions)
\`\`\`

- **Project**: the existing logical, durable project group, not the current folder string alone.
- **Work Item**: a goal-specific, project-owned entity; can be active, completed or archived.
- **Session**: an ordinary Pi conversation, retaining its original identity, project binding, transcript, model, tool permissions and lifetime.
- **Work Item–Session link**: optional grouping metadata; deleting a link must not delete a session.
- **Engineering Activity** (PR #53): a session-scoped observed activity, not a synonym for Work Item or Task Node.
- **Workflow Run** (legacy V0): existing project-owned engineering workflow with a fixed six-stage history; evaluate reuse of persistence/recovery primitives, but do not transplant its stage locks or assume a 1:1 semantic mapping.
- **Execution Run / Artifact / Evidence**: linked later using their authoritative Host-owned identifiers and verified source versions.

MVP ownership constraint: each Session has **zero or one primary Work Item within its owning project**. References from another Work Item can be considered later but should not silently imply shared execution ownership. Multiple Session links can belong to one Work Item. No cross-project attachment, reassignment or root permission widening without an explicit separately reviewed operation.

## 3. Conversation membership rules

| User action | Membership result |
| --- | --- |
| Create conversation inside a Work Item | Use the ordinary native session creation route; link its confirmed Session ID to that Work Item |
| Create conversation from the normal project/chat entry | Leave ungrouped by default; ordinary chat remains a first-class path |
| Move/link a historical conversation | User explicitly selects a Work Item; enforce same-project ownership and one-primary-group limit |
| Remove a conversation from a Work Item | Detach the link only; transcript, title, message history and native status remain intact |
| Rename/archive/complete a Work Item | Change Work Item metadata only; do not complete or stop Sessions |
| Delete a Work Item | Confirm and remove grouping/association metadata; never delete native Sessions or project files |
| Delete a native Session | Reconcile the link as unavailable/remove it safely; do not keep a clickable invalid Session |
| Delete the Project | Respect the existing Host-owned project/session deletion policy and clean up orphaned Work Item metadata |
| Conversation contains unrelated goals | Keep one explicit primary Work Item in MVP; offer a manual split/new-item operation later |
| AI detects a likely relationship | Suggest an association only; never silently assign, move or split chats |

If native session creation succeeds but the link operation fails, keep the new Session ungrouped and expose a retryable attachment error. Do not recreate the Session or replay its prompt.

## 4. Independent Navigator page: MVP information architecture

**Do not modify the native project sidebar or force a new tree structure in the first release.** A separate Navigator entry (prefer the existing work-panel extensibility point/feature module) presents a project-scoped Work Item view alongside ordinary Pi chat.

\`\`\`text
Navigator / Work Items
  Left: Work Item list (active / completed / archived; create, rename, select)
  Main: selected Work Item overview (goal, status, last activity, next user action)
  Tabs/sections:
    Conversations  — linked Session list, open native chat, new chat, attach/detach
    Artifacts      — explicit Spec / Plan / Review references and versions
    Activity       — linked run/turn evidence when authoritative identifiers exist
    Tasks          — later optional task list / graph; not required for MVP
  Independent "Ungrouped Conversations" entry (view only; links to native chat)
\`\`\`

The normal chat and Coding Action/Skill Launcher remain available, including when Navigator is disabled. Clicking a linked Session navigates via the existing session-selection route. A Work Item can be reopened across application restarts without injecting its entire chat history into the model. When a new Skill is invoked, only the user-selected, authorized Work Item artifacts and necessary confirmed context are handed off; explicit Send remains required.

A plugin-provided work-panel view is the preferred UI exploration path, **conditional** on verified access to ordinary native Session IDs, project identities and allowed navigation via existing permission-gated APIs. The current imported-session plugin API is not permission to read every native conversation. If the plugin surface is insufficient, use a narrow Navigator-owned UI and additive read/association endpoints instead of broadening plugin permissions or changing Pi session semantics.

## 5. Suggested minimal persistence (not an implementation commitment)

Host Core remains the durable authority (existing host-owned versioned KV or additive SQLite metadata after evaluating current domain models). UI state is a projection, never the source of truth.

\`\`\`text
WorkItem
  id, projectGroupId, title, optionalSummary
  status, version, createdAt, updatedAt, archivedAt?

WorkItemSession
  workItemId, sessionId, linkedAt, linkedBy
  [unique primary Work Item per Session; same-project constraint]

Later, only as needed:
  WorkItemArtifact(workItemId, artifactId, versionRef, verification)
  WorkItemTask(workItemId, taskId, dependencies, acceptance)
  TaskExecution(taskId, sessionId, turnId, sourceRunId, outcome)
\`\`\`

The concrete schema, transaction boundaries and migration must be designed against the actual Host data model rather than creating a second independent session store. Use existing stable Session IDs and project identities. For references to files, retain path/source + content hash/version; never infer that a file or its content was produced by a particular Skill without evidence.

## 6. State, recovery and trust rules

- **Work Item state** (active/completed/archived) is distinct from **Session/Turn** status and later **Task Node** acceptance.
- Finishing a conversation, model reply or Skill call cannot automatically complete a Work Item.
- Persist grouping and session references in Host-owned storage so app restart, reload and session switching do not lose them.
- On restart reconcile missing/deleted sessions, interrupted runs and invalid artifacts; show uncertain outcomes explicitly. **Never automatically replay tools, queued turns or prior prompts.**
- Same Work Item does **not** mean all linked chat histories become one model context. Only explicitly selected, accessible inputs may be used; project/session permission boundaries remain intact.
- Actor/user confirmation and actual tool outcomes must be distinguished from model-reported claims.
- Project deletion must follow the existing policy that owns and removes its sessions; Work Item deletion is deliberately less destructive.
- Associations must be concurrency-safe and idempotent; stale/late events must not attach a result to the wrong item or session.

## 7. Delivery slices and acceptance

**Slice 0 — extension-surface feasibility:** Verify whether the existing Navigator/work-panel/plugin APIs can list/open ordinary native Sessions safely. Document exact missing capabilities before requesting any new Host APIs; no runtime or sidebar change.

**Slice 1 — optional grouping MVP:** Work Item CRUD, attach/detach Sessions, create native Session from Work Item, ungrouped chat access, reopen/restart persistence. No task graph or auto-clustering. Acceptance: normal chat unchanged; project isolation; session deletion leaves no broken clickable link; deleting a Work Item never deletes chats; failed linkage can be retried without duplicating a Session.

**Slice 2 — artifact handoff:** Add explicit file references and version/approval checks. Validate Matt Spec (Session A) → Superpowers Plan (Session B) within one Work Item. Acceptance: stale/removed/unapproved inputs are visible and never silently treated as valid.

**Slice 3 — execution evidence and optional tasks:** Attach existing Pi Session/Turn outcomes to Work Item and optional Task Node; support interrupted/failed/unknown statuses. Add Review/Bug branches and eventually a task graph only after evidence attribution is reliable.

### Minimum regression scenarios

1. Multiple independent conversations appear under one Work Item, retaining original Session IDs and chat behavior.
2. Ungrouped chats remain usable even when Navigator is disabled.
3. After moving/detaching a Session, the transcript and permission mode are unchanged.
4. Reload/restart preserves grouping; an interrupted run is not automatically replayed.
5. Deleted/missing Sessions become unavailable without corrupting other Work Items.
6. A Session from another project cannot be linked without an explicit, authorized cross-project design.
7. A failed association does not duplicate the Session or prompt execution.
8. Spec v1 changed to v2 invalidates stale Plan references until user review.
9. Executed Tool/Turn observations are kept distinct from Agent-written completion claims.
10. Existing #46/#53 acceptance and legacy project Workflow data are unaffected.

## 8. Extension-first implementation guardrail

For a feature specific to mattpocock-PI, evaluate in order: existing public API/plugin/work-panel integration → independent Navigator domain modules/adapters → additive, Host-owned metadata and narrow IPC/RPC → minimal, reviewed core integration. Do **not** alter PI-Desktop's Project, Session, Turn, queue, permission or Pi Agent Runtime lifecycles just to add grouping or workflow organization.

If a core change is unavoidable, first document what extension paths were tried and why they failed, the exact affected lifecycle invariants, upstream merge impact, compatibility and migration implications, and regression tests; obtain explicit architecture approval and a relevant ADR. A quick workaround is not an acceptable exception.

This document is a **proposal** for follow-up issues. PR #63 remains documentation only; it does not assert that these surfaces or associations have already shipped and does not enlarge issue #46 or PR #53.
