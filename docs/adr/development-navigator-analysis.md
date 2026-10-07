# ADR: Development Navigator analysis execution

- Status: Implemented candidate; enforcement covered by contract and process tests
- Date: 2026-10-07
- Related: Development Navigator specification and issue #50

## Context

Navigator recommendations use the installed ask-matt engineering method, but
must only analyze explicitly selected evidence. Ordinary agent turns load broader
session/project context, persist into the conversation, and may involve extensions
or tool execution. A Skill name or prompt instruction does not establish a
read-only capability boundary. Navigation must not create hidden conversations
or change Pi Agent Runtime core semantics.

## Decision

Load the effective installed ask-matt document through the existing native Skill
resolution rules. Reuse the existing one-shot completion capability with the
current conversation's provider/model binding, no model tools, and a materialized
snapshot of selected evidence. Navigation Analysis is an application operation,
not an ordinary slash-invocation turn. Record its method/source and evidence basis
under the selected Engineering Activity rather than creating another activity.

Host retains authoritative navigation state. Main orchestrates model binding,
native Skill resolution, permission-checked evidence reads, and cancellation.
Renderer selects references and renders results; it cannot supply authority or
directly read files/provider credentials. Analysis and ordinary execution share
an authoritative admission boundary so that idle checks cannot race.

Selected file references must pass existing authorization and containment before
reading. The model receives only approved snapshot contents and no executable
tools. Skill and result text remain untrusted input. Suggestions are validated
preparation metadata, never commands or authorization to execute.

## Alternatives

- Ordinary ask-matt turn: retains native slash semantics but cannot establish
  selected-only context, and pollutes engineering activity/transcript attribution.
- Prompt-only restrictions: simple but do not prove read scope or effect denial.
- New hidden session or separate Runtime: adds execution ownership and lifecycle
  paths that the accepted product boundary explicitly excludes.
- Static follow-up rules: cheap and deterministic but do not provide the accepted
  ask-matt evidence-sensitive analysis.

## Consequences

This uses an installed Skill as the analysis method without claiming a normal
Skill turn occurred. File approval, model binding, tool denial, cancellation,
duplicate admission, deletion, and stale-result ownership require contract tests.
An unsupported model binding or unavailable Skill produces a visible failure,
not silent substitution. No implementation is accepted solely on this ADR.

If existing ownership or capability mechanisms cannot satisfy enforcement,
present alternatives and migration impact before changing frozen boundaries.
