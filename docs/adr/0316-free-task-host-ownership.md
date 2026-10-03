# ADR 0316: Free Tasks use Host records and ordinary Agent execution

- Status: Implementation candidate
- Date: 2026-10-02

## Context

The accepted Coding Workbench supports arbitrary skill order without changing
formal workflow acceptance. Reusing strict stage reservation would bypass its
contract. Renderer-only task records cannot prove cancellation ownership or
retain outcomes through restart. The existing Host KV store and turn lifecycle
provide durable identities without a second agent engine or new SQL schema.

## Decision

Host owns versioned Free Task documents in an additive namespace. Reservation,
turn binding and settlement use the existing database transaction and Agent
execution boundary. Main revalidates the installed skill and submits canonical
Host input. Renderer manages drafts and presentation, not authoritative outcomes.
An optional request field binds a Free Task to ordinary Agent admission.
Formal Workflow Runs remain separate and retain explicit stage acceptance.

Initialization is a native Host preparation operation with capability-relative
file previews and writes, explicit selected files and stale-preview checks.
The preview and item outcomes are retained in their own versioned namespace.
Publication uses a same-directory prepared file and an atomic no-overwrite link.
When modification is selected, retain the displaced original as a recoverable
artifact, recheck it and publish only into a vacant target. Restore the original
only into a vacant target on failure, preserving any concurrently created file.
Already-open editor handles can continue writing into the retained original.
This trades a brief missing-path interval and explicit backup retention for
avoiding silent data loss at the final preview/write race. Backups are not pruned
automatically; the result provides recovery references.
No skill body or filesystem write authority moves to Renderer.

## Alternatives

Unlocking all Workflow stages would change existing workflow semantics.
Renderer-only persistence would lose authoritative execution ownership.
A second execution engine would duplicate permissions, cancellation and recovery.

## Consequences

Old clients ignore the new namespaces and optional field; existing SQL schema
and user data remain intact. Unknown future documents must remain unchanged.
Unsettled tasks recover as Interrupted with explicit retry. Concurrent writes
without a distinct worktree are rejected before mutation. Installation remains
explicit and existing user skill definitions retain precedence.

## 2026-10-03 presentation amendment

The user simplified the workbench to ordinary Composer skill insertion and
manual submission. Renderer no longer reserves or automatically dispatches
Free Tasks from engineering buttons. The native initialization button is
replaced by the actual `setup-matt-pocock-skills` prompt.

This changes presentation, not persisted ownership or historical data. Retain
Host APIs, versioned records, restart interruption and initialization backups
for existing data/clients. Ordinary turns still use the same admission and
permissions. No schema migration or automatic replay is introduced. The
[current product specification](../spec/01-product/coding-workbench-free-tasks.md)
supersedes the original workbench intake/result presentation.
