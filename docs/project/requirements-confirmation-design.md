# Requirements Confirmation Interaction Design

Date: 2026-10-04
Status: User-confirmed product direction; implementation candidate, release pending.
Scope: Record the decisions from the requirements discussion. This document
does not change the shipped Workflow acceptance contract.

## Current behavior verified

- Composer's Discuss requirements and Form specification actions prepare
  skill drafts. The user submits them manually; neither records approval.
- Form specification synthesizes discussed requirements into a specification.
  Producing that document does not establish the user's approval of its content.
- Workflow already requires explicit stage acceptance after a tracked execution
  ends normally. Accepting Spec unlocks Tickets without starting it.
- Existing stage acceptance records stage revision, execution identity and
  decision time. It does not bind or verify specification file contents.
- Ordinary chat output cannot currently satisfy Workflow stage execution
  prerequisites. Artifact reference registration does not accept a stage.

Sources: [shortcut specification](../spec/01-product/coding-workbench-free-tasks.md),
[Workflow specification](../spec/01-product/engineering-workflow-v0.md),
[ownership ADR](../adr/0314-engineering-workflow-ownership-and-acceptance.md),
and the current Composer, Workflow controls and host stage acceptance code.

## Confirmed product decisions

1. Use **Confirm requirements**, with the Chinese UI label **确认需求**.
   Requirements remain editable after confirmation; this is not a freeze.
2. Place the action beside the Composer requirements controls. The conceptual
   sequence is discussion, specification formation, human confirmation, then
   task breakdown. Existing shortcuts retain manual draft submission.
3. Confirmation is a native user decision with a retained record. It does not
   merely insert an approval sentence into a chat draft.
4. Show the selected project specification file and a brief summary for the
   user to inspect before confirming. Associate the decision with the approved
   specification content version.
5. Clicking confirmation does not start task breakdown, implementation or any
   other Agent execution.
6. Ordinary chat specifications can be confirmed by selecting a project file.
   No Workflow Run or tracked Spec execution is required for this action.
7. Composer and Workflow share the requirements confirmation record, rather
   than maintaining competing approvals of the same specification version.
8. Requirements Confirmation and Stage Completion remain distinct. A file
   confirmation must not bypass Workflow's execution or prerequisite checks.
   Existing stage acceptance alone must not be presented as content approval.
9. When specification content changes, indicate that renewed confirmation is
   needed. Preserve earlier confirmation records. Changes to scope, behavior or
   acceptance criteria also require assessing the affected downstream tasks.

## Representative acceptance scenarios for implementation

- In an ordinary chat, discuss requirements and form a specification; select
  that file, inspect it and confirm. A version-associated record appears
  without creating a Workflow Run or sending another Agent prompt.
- Open Workflow for the same project and specification. Both surfaces show
  the same Requirements Confirmation, while unmet stage prerequisites remain
  unmet. There is no second, conflicting content approval record.
- Cancel the confirmation preview. No approval is recorded and the Composer
  draft, attachments and Workflow state remain unchanged.
- Modify a confirmed specification. After freshness is checked, show that the
  current content requires confirmation again; retain the historical decision.
- Confirm the revised specification. Record the new content version without
  automatically executing tasks or rewriting earlier decisions.
- Reload or restart. Retained decisions remain available to the same logical
  project; they must not leak into another project's requirements.
- Switch project or change the file while a preview is loading. A stale
  preview must not approve a different project or content version.
- Reject missing, unreadable or out-of-project files without recording a
  successful confirmation or weakening existing filesystem permissions.

## Engineering details to settle before implementation

The following are proposed safeguards, not claims about existing behavior or
additional product decisions already made by the user:

- Host-owned durable records should follow existing project ownership and
  filesystem boundaries. Define the additive shared contract, compatibility
  behavior and multi-specification identity before adding persistence.
- Define version comparison and freshness checks, including concurrent edits
  between preview and confirmation. Do not claim immediate change detection
  until the observation mechanism and cleanup paths are specified.
- Define how Workflow selects a specification, associates its shared content
  confirmation and handles later changes. Do not silently invalidate existing
  stage history or fabricate tracked execution from ordinary chat.
- Define how the brief summary is obtained and bound to the selected version.
  Opening confirmation must not implicitly call a paid model or execute a skill.
- Provide explicit file selection when there is no unambiguous specification;
  do not infer approval from conversation text or a filename alone.

The [implementation specification](../spec/01-product/requirements-confirmation.md)
settles these details: optional Host-owned versioned KV history, SHA256 content
identity, explicit file selection, deterministic excerpts, open/refresh/submit
checks and independent Workflow stage acceptance. Validation results belong in
the delivery record; this design does not claim them merely from implementation.
