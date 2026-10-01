# ADR 0314: Engineering Workflow Ownership and Acceptance

- Status: Accepted design; not implemented
- Date: 2026-10-01

## Context

Engineering stages span multiple Pi turns and conversations. Existing Skill
calls load instructions, and turn termination does not establish engineering
acceptance. PI-Desktop already owns logical project identities and durable kv
storage in Rust host-core. Treating visible chat completion or renderer state
as authoritative would conflate runtime progress with engineering acceptance
and make histories vulnerable to navigation, reload, and stale events.

## Decision

Logical project groups own retained Workflow Runs, with at most one active run
per project. Rust host-core owns versioned durable state and guarded transitions
through its existing kv extension boundary; renderer state is a projection.
Executions reuse Pi and bind to their initiating project, run, stage revision,
session, and admitted turn. The user explicitly accepts stage completion in V0.
Reopening retains artifacts but withdraws downstream acceptance. Interrupted
work never replays automatically.

## Alternatives

- Session-owned runs lose project continuity across chats.
- Renderer local storage cannot authoritatively guard host execution or reliably
  reconcile background turns and restart recovery.
- Turn-end auto-advancement confuses a completed question or partial task with
  completed engineering work.
- A new relational workflow schema is premature while existing host kv storage
  can represent the required versioned documents.

## Consequences

The UI feature requires small additive host and shared-contract changes rather
than living exclusively in a renderer folder. User acceptance adds an explicit
action but avoids false progression. Artifact existence and review correctness
remain unverified in V0. No Pi runtime replacement or new database is required.
This record explains the trade-off; the [implementation specification](../spec/01-product/engineering-workflow-v0.md)
defines the intended behavior and tests must prove the later implementation.
