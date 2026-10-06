# Coding Workbench Skill Shortcuts

- Date: 2026-10-03
- Status: Implementation candidate; release pending.
- Authority: User-confirmed [interaction design](../../project/skill-shortcuts-interaction-design.md).
- Audience: Developers using PI-Desktop for coding work.

## Interaction contract

The Composer presents compact engineering skill buttons on both home and
conversation surfaces. The primary actions stay available; an Ask button
opens `ask-matt`, and a More menu exposes the remaining Matt skills used by its
router. Actions can be selected in any order. Selecting a button adds its slash
skill marker to the current draft, using the same
`formatCommandInsert` representation as slash completion. Existing text, file
references and image attachments remain intact. The marker is prepended so it
cannot accidentally become an argument to a leading builtin command.


Every skill shortcut, including Ask and every More menu item, inserts its
localized editable default instruction after the resolved slash marker.
Existing draft text is preserved verbatim after a blank line; attachments and
manual Send behavior remain unchanged. Workflow navigation and opening More
do not insert instructions. Ask inspects current project evidence and proposes
a concrete next action before implementation; the remaining prompts follow
the corresponding Matt skill methodology. Prompts do not authorize Git delivery.

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


The shortcuts use two separate wrapping rows. The first row is Ask next step,
Discuss requirements (with Form specification and Split tickets in its
split-button menu), Implement, Diagnose bug, and Review code, in that order.
The second row contains the subdued Engineering Workflow panel and More.
More groups skills into Requirements and exploration, Implementation and
maintenance, Collaboration and reflection (including Retrospective), and
Project setup (Initialize). Every skill remains available exactly once.
All shortcuts use regular text. At narrow widths each row wraps independently
without horizontal overflow; order stays fixed across task states.

## Requirements confirmation

Coding Actions no longer exposes the separate Confirm requirements action.
Workflow retains the project specification preview and confirmation dialog.
See [Requirements Confirmation](requirements-confirmation.md) for content-version
approval, history and freshness rules. Existing skill shortcuts retain the
draft-only behavior described above.

## Global instruction settings

Composer skill buttons, including the requirements and More menu entries,
show the same localized usage timing, purpose and example on pointer hover
or keyboard focus. Guidance uses the shared portal tooltip so menu clipping
does not hide it; it wraps within the viewport. Reading a tooltip does not
change the draft or execute a skill. Clicking dismisses it and retains the
existing draft insertion behavior. Buttons retain short accessible names
and expose their guidance as accessible descriptions.

For every one of the 26 engineering entries, the instruction editor shows
localized guidance before the prompt: when to use the skill, what it does,
and one concrete example request. Selecting a different entry switches all
three descriptions together. Guidance is read-only product copy, separate
from editable prompt overrides and installed skill definitions. Reading it
does not insert a draft, save settings or execute a skill.

Settings > Agent > Skills edits all 26 shortcut instructions globally across
projects, including More menu skills. Saving an empty string selects only
the skill marker. Restore default clears the override and uses the current
UI language's built-in instruction. Custom text remains verbatim when the
UI language changes and survives skill updates. Existing Composer drafts
and attachments are never rewritten by a settings edit.

Host persists optional engineeringShortcutPrompts, preserving older profiles.
Null per action means restore; an empty string is a deliberate empty override.
Each instruction is limited to 16,000 UTF-16 code units. Boundary validation
rejects unknown actions, invalid values and embedded NUL characters.

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

## Requirements split button

Discuss requirements is the fixed primary action. Its adjacent arrow opens a
menu containing Form specification and Split tickets. Selecting either inserts
the corresponding skill and closes the menu without changing the primary action.
Escape and outside clicks dismiss the menu; disabling the Composer closes it.
The group wraps as one unit at narrow widths. Existing draft and manual-send
semantics remain unchanged.
