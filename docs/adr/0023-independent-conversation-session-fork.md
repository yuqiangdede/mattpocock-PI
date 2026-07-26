# ADR 0023: Independent Conversation Session Fork

## Status

Accepted.

## Context

PI-Desktop already preserves linear regenerate variants within one
conversation. Users also need a Codex-style command that copies the current
conversation so later prompts and configuration changes can diverge without
rewriting the source.

Composing `session.create` and message replacement in the renderer would expose
partial children, lose canonical transcript blocks, omit per-session execution
configuration, and cross the Rust host's persistence ownership boundary. Adding
the operation while retaining protocol v4 would also allow an older host to
pass startup handshake and fail only when the new command is invoked.

## Decision

- Protocol v5 adds required host RPC `session.fork` and renderer IPC
  `session/fork`.
- The Rust host owns one snapshot operation: it copies the source's complete
  active canonical transcript into a new session and remaps message and
  tool-call identifiers.
- The child inherits project, provider, model, mode, thinking, and permission
  mode. It does not inherit turns, regenerate revisions, notifications,
  artifacts, session grants, scratch data, pin state, or live runtime state.
- No parent/child lineage is stored. This is an independent conversation copy,
  not a message tree and not a replacement for linear regenerate history.
- Fork is available only while the source is idle. Electron exposes
  `AGENT_BUSY`; the host retains a persisted running-turn `CONFLICT` guard that
  Electron normalizes at the IPC boundary.
- A handled file or index failure removes the child transcript and leaves no
  visible child. Process crashes continue to follow the transcript store's
  existing orphan-file recovery policy.

## Consequences

- Renderer and host binaries from protocol v4 are rejected during startup
  instead of failing lazily when Create branch is selected.
- Source and child can evolve, reconfigure, persist, and delete independently.
- Fork storage cost is proportional to the active transcript size.
- The initial implementation intentionally has no ancestry UI, merge operation,
  or arbitrary message-level branch tree.

## Alternatives

- Renderer-owned `create + replaceMessages`: rejected because it is not atomic
  across the host-owned transcript and index.
- Persistent parent/child lineage: deferred because the requested workflow only
  needs an independent copy and D109 keeps message revision navigation linear.
- Copy regenerate revisions: rejected because revision roots and message
  identifiers would require a second branch graph and ambiguous pager history.
