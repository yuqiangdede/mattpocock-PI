# ADR: Share requirements content approval independently of Workflow stages

- Date: 2026-10-04
- Status: Accepted for implementation by the confirmed product direction.

## Context

Composer can produce specifications in ordinary chat. Workflow stage acceptance
requires tracked executions and records an execution revision, not file content.
Users need to approve the current requirements before task breakdown while
retaining the ability to revise them. Conflating these decisions would either
force a formal run or silently bypass its execution gates.

## Decision

Store content-version Requirements Confirmation separately from Stage Completion,
under existing Host-owned project KV persistence. Both UI surfaces use the same
service and record. A confirmation binds file identity and SHA256, and does not
mutate Workflow eligibility. Host compares preview version and history revision
at submission. Old decisions remain historical after edits and reconfirmation.

## Alternatives

- An approval prompt in chat is easy to insert but lacks authoritative durable
  version association and a reliable human-decision boundary.
- Reusing stage acceptance would require ordinary chat to fabricate tracked
  execution or force users into formal Workflow for every specification.
- Separate Composer and Workflow approval histories would permit inconsistent
  decisions for the same specification version.
- A live watcher adds ownership and recovery complexity without being needed
  for explicit preview and submit-time checks.

## Consequences

The optional versioned namespace preserves existing profiles and Workflow
documents. Native IPC is additive and retains file-preview permission checks.
Both surfaces agree on file approval, while users still explicitly manage
Workflow acceptance and downstream consequences of requirement changes.
Stored hashes preserve decision identity, not historical copies of file content.
The [product specification](../spec/01-product/requirements-confirmation.md)
defines behavior; this record explains the trade-off.
