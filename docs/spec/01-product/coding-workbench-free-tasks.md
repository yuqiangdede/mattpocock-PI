# Coding Workbench Skill Shortcuts

- Date: 2026-10-03
- Status: Implementation candidate; release pending.
- Authority: User-confirmed [interaction design](../../project/skill-shortcuts-interaction-design.md).
- Audience: Developers using PI-Desktop for coding work.

## Interaction contract

The Composer presents compact engineering skill buttons on both home and
conversation surfaces. The eight primary actions stay visible; an Ask button
opens `ask-matt`, and a More menu exposes the remaining Matt skills used by its
router. Actions can be selected in any order. Selecting a button adds its slash
skill marker to the current draft, using the same
`formatCommandInsert` representation as slash completion. Existing text, file
references and image attachments remain intact. The marker is prepended so it
cannot accidentally become an argument to a leading builtin command.

Selection does not submit, create a session, reserve a Free Task, initialize
files, call a model or change Workflow stage acceptance. The user edits and
explicitly sends the draft through ordinary Composer controls. Skill loading,
permissions, conversation context, queueing, Stop and results follow the same
path as a manually entered slash prompt. Repeated selections retain prior text,
including prior markers; ordinary slash processing resolves those mentions.

| Button | Skill |
| --- | --- |
| Initialize | `setup-matt-pocock-skills` |
| Discuss requirements | `grill-with-docs` |
| Form specification | `to-spec` |
| Split tickets | `to-tickets` |
| Implement | `implement` |
| Diagnose bug | `diagnosing-bugs` |
| Review code | `code-review` |
| Retrospective | `retro` |

The Ask button inserts `ask-matt`. The More menu inserts `grill-me`, `grilling`,
`handoff`, `prototype`, `improve-codebase-architecture`, `codebase-design`,
`domain-modeling`, `tdd`, `wayfinder`, `triage`, `research`,
`resolving-merge-conflicts`, `teach`, `to-questionnaire`, `wait-what`, `wizard`,
or `writing-for-agents`.

## Catalog and lifecycle

Selection reads the existing Composer command catalog. User skill definitions
and project/global precedence remain authoritative. Missing or disabled skills
leave the draft untouched and expose a localized error and Configure skills
button. No installation, enablement or fallback happens automatically. Catalog
failures remain visible and can be retried. Missing model configuration does
not prevent preparing a draft; ordinary manual submission validates it.

After an asynchronous catalog read, recheck draft/session/project ownership and
input availability. A stale response must not write to another conversation,
overwrite edits made while waiting, cross an IME composition or mutate a
blocked Composer. Simultaneous clicks cannot overlap catalog selection. Normal
busy conversations still allow drafting; only manual Send enters the existing
queue. Native session and pending approval gates remain unchanged.

Drafts retain the ordinary Composer cache semantics across navigation and
home/conversation remounts. This feature does not add disk persistence or promise
draft recovery after a complete renderer restart.

## Engineering initialization

The initialization button inserts `/setup-matt-pocock-skills`. On manual send,
the actual skill discovers and configures the issue tracker, engineering
documents and skill conventions, asking its own questions in chat. The button
does not create code scaffolding, install dependencies or apply native file
previews.

## Compatibility and presentation

Replace task cards, intake panels, independent task results and automatic
waiting-task dispatch with ordinary chat. Retain Full Engineering Workflow in
its Work Panel, with existing acceptance and prerequisite rules. No Host schema,
protocol or permission boundary changes are required.

Legacy Free Task/initialization APIs and storage remain compatibility surfaces;
new shortcuts do not use them. Preserve old histories, saved legacy drafts,
initialization backups and project files. Existing Host startup recovery marks
unsettled legacy records Interrupted without replay; settled records stay
unchanged and waiting/interrupted records do not block ordinary chat. Do not
purge user state to retire the old Renderer.

Use shared buttons and i18n for all text, hints and accessible names. Controls
wrap at narrow widths, stay keyboard reachable and return focus to the editor
on successful insertion. Navigation is independent of runtime execution.

## Acceptance and validation

The public test seam is the real buttons and Composer, including manual Send,
with real store, Main/Host and Agent Runtime wiring and only the external model
fixture substituted. Host recovery is verified through its existing public
reservation/read/session boundaries.

- All eight primary mappings, Ask, and every More item insert without execution,
  including engineering setup.
- Existing text and attachments survive insertion and navigation.
- Explicit Send loads the same skill and prompt as equivalent manual slash input.
- Busy insertion only edits; manual Send uses ordinary queueing.
- Missing/disabled/catalog-error selection preserves draft and permits recovery.
- Delayed catalog responses cannot cross sessions or overwrite newer edits.
- Keyboard and narrow-window controls remain usable.
- Legacy records/files/backups and strict Workflow semantics remain intact.

See [E2E scenarios](../06-delivery/04-e2e-test-plan.md#coding-workbench-skill-shortcuts)
and [delivery evidence](../../project/skill-shortcuts-delivery.md).
