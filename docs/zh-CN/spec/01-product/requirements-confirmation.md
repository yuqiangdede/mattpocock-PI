# Requirements Confirmation

> **镜像说明：** 本页对应 [英文源规格](/spec/01-product/requirements-confirmation)。正文保留英文，以源规格为准。


- Date: 2026-10-04
- Status: Implementation candidate; release pending.
- Authority: [Confirmed interaction design](../../../project/requirements-confirmation-design.md).

## User path

Composer exposes Confirm requirements beside Discuss requirements. Workflow
exposes the same action for its available project even when there is no run.
The action opens a modal; it does not insert a prompt or change a draft.

Select a registered project root and enter a root-relative `.md`, `.markdown`
or `.txt` path. Preview / refresh reads a nonempty UTF-8 file up to 256 KiB,
shows an excerpt and expandable full content, its content version and status.
Confirm this version records the human decision. Cancel records nothing.
Previously confirmed files can be selected from retained confirmation history.

The excerpt consists of the first eight nonempty lines, limited to 1,200
characters. It describes the exact preview content without model execution;
it is not an AI judgment that the requirements are complete or correct.

## Ownership and contracts

Rust host-core owns a separate versioned `requirementsConfirmations` KV
document keyed by logical project-group identity. No SQLite schema migration
is needed: this is a new optional namespace, independent of Workflow documents.
Malformed, future-version or inconsistent records are preserved and block writes.
Multiple specification files and their chronological decisions share a project
history, identified by registered root and normalized root-relative path.

Additive IPC channels are `requirementsHistory`, `requirementsPreview` and
`requirementsConfirm`. Host RPC methods are `requirements.history`,
`requirements.resolve`, `requirements.preview` and `requirements.confirm`.
Requests reject unknown fields and invalid identities, relative paths, safe
revisions and SHA256 hashes. Host validates schemas again and owns filesystem
containment and authoritative content hashing. Electron Main reuses the current
file-preview reader's permissions and ignore rules before preview or confirmation.
It rejects host replacement or resolved-path changes during that check.

Decisions contain an id, registered workspace root, relative path, SHA256 of
the full observed bytes and decision time. The renderer cannot supply approved
content or timestamps. Submit carries the preview hash and history revision;
Host reads again and rejects changed content or concurrent history. An immediate
duplicate confirmation of the already current version is idempotent.

## Freshness and history

On opening, the most recent confirmation whose root is still registered is
selected and rechecked. Explicit Preview / refresh checks another selected file.
Checks classify it as unconfirmed, confirmed or changed relative to its latest
decision. Submission always checks again. There is no background file watcher
and no promise of live detection while the dialog is idle.

Any byte change requires renewed confirmation when observed. Historical
decisions remain available, including after reconfirmation, reload and restart.
Selecting a historical decision selects its file's current content; it does not
reconstruct the old file. Missing or unreadable files show an actionable error
without erasing history. Removed roots remain historical and cannot be selected.

## Workflow compatibility

Both entry points use one project confirmation service and history. Ordinary
chat confirmation does not require or create a Workflow Run. Workflow stage
acceptance, execution prerequisites, revisions and reopening remain independent.
Confirmation does not unlock stages, invalidate stages, register artifacts,
dispatch skills or start downstream work. Existing stage acceptance does not
claim approval of actual specification content. Changing requirements prompts
the user to review affected tasks; any Workflow reopening remains explicit.

## Lifecycle and acceptance

Project switching closes the owned dialog. Late async results cannot populate
another project's state. Inputs are disabled while a request is pending;
confirmation cannot overlap. Cancel/Escape restore focus after idle dismissal.
The dialog uses application overlay ownership, native modal focus handling,
localized labels and shared form primitives. Raw file content is rendered as
text, never interpreted as HTML or instructions.

Required verification: shared request validation, Host persistence/change/race/
isolation/compatibility tests, native IPC access/host/path guards, and isolated
Electron interaction through the production Composer and Workflow components.
The representative suite is `pnpm test:e2e:requirements-confirmation`; it covers
cancel, preserved draft, ordinary chat approval, shared Workflow history without
stage advancement, stale-preview rejection, reconfirmation, project switch,
localization and Host restart. No live provider or paid model is used.
