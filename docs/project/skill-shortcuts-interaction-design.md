# Skill Shortcut Interaction Design

Date: 2026-10-03
Status: User-confirmed interaction direction; implemented and validated locally.
Purpose: Simplify the coding workbench into shortcuts for existing Composer skills.
This is a proposed change to the shipped PR #15 behavior, not a claim that the
runtime has already changed.

## Confirmed interaction

Selecting a shortcut adds the corresponding skill marker to the current
conversation's Composer draft. Existing text remains intact. The shortcut
does not submit the draft, start execution or create a separate task.
The user reviews and edits the draft, then explicitly sends it using the
ordinary Composer controls.

An empty draft receives the selected skill marker and its default instruction. A non-empty draft
retains its existing content and adds the marker. Use the existing slash-skill
insertion semantics rather than implementing a second skill invocation format.
Ordinary submission supplies context, Skill loading, permissions, queueing,
Stop, errors and conversation output exactly as manual slash invocation does.


Every skill shortcut, including Ask and every More menu item, inserts its
localized editable default instruction after the resolved slash marker.
Existing draft text is preserved verbatim after a blank line; attachments and
manual Send behavior remain unchanged. Workflow navigation and opening More
do not insert instructions. Ask inspects current project evidence and proposes
a concrete next action before implementation; the remaining prompts follow
the corresponding Matt skill methodology. Prompts do not authorize Git delivery.

## Visible controls

Use a compact button area rather than task cards with separate forms:

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

Add an **Ask** button for `ask-matt`. Add a **More** menu for the other Matt
skills routed by `ask-matt`: `grill-me`, `grilling`, `handoff`, `prototype`,
`improve-codebase-architecture`, `codebase-design`, `domain-modeling`, `tdd`,
`wayfinder`, `triage`, `research`, `resolving-merge-conflicts`, `teach`,
`to-questionnaire`, `wait-what`, `wizard`, and `writing-for-agents`.

Keep the shortcuts available on the home surface and through a compact
conversation entry. Skill identity and availability follow the existing
catalog and user definitions; unavailable skills are not silently installed,
enabled or replaced. All labels and accessible names follow application i18n.


The shortcuts use two separate wrapping rows. The first row is Ask next step,
Initialize, Engineering Workflow panel, and More features, in that order.
The second row is Discuss requirements (with Form specification and Split
tickets in its split-button menu), Implement, Diagnose bug, Review code,
and Retrospective. Discuss requirements,
Implement, and Diagnose bug use bold text; all other controls use regular text.
At narrow widths each row wraps independently without horizontal overflow.

## Engineering initialization boundary

Engineering initialization invokes the actual `setup-matt-pocock-skills` skill.
It configures the issue tracker, triage vocabulary and domain documentation
conventions. The skill performs its own discovery and confirmation in chat.
It does not create a project code skeleton or install runtime dependencies.
This replaces the former native project-preparation button in the proposed UI.

## Simplification boundary

- Remove the shortcut-triggered task intake panel and independent result cards.
- Do not create new Free Task records or a parallel execution path from shortcuts.
- Use ordinary chat for skill questions, results, waiting and recovery.
- Retain the existing optional strict Engineering Workflow in its original
  Work Panel location; selecting a shortcut does not accept its stages.
- Preserve existing project files, initialization backups and persisted task
  history. Removing presentation must not delete user data. Legacy unsettled
  reservations and their recovery need inspection before retiring task APIs.

The user corrected the earlier click-to-send recommendation: click-to-insert
with manual submission is authoritative for this design.

## Existing seams and implementation handoff

Composer completion already updates the editor draft without sending;
ordinary Composer submission then calls the existing prompt/queue path.
Prefer those public entry points for button insertion and manual submission.
Do not add a task form, automatic send, a new provider invocation or a new
Host persistence model to implement shortcut selection.

## Acceptance checks

1. Click each primary shortcut, Ask, and a More item in an empty Composer: its
   corresponding marker and localized default instruction appear, the input can be edited, and no prompt or task
   is submitted.
2. Click with existing text and attachments: content and attachments remain;
   the marker and default instruction are added. Closing or switching views does not lose draft data.
3. Manually send a selected skill with task text: the same skill and current
   conversation context are used as the equivalent manually composed slash input.
4. While a conversation is running, shortcut selection only edits the draft;
   manual submission follows normal queueing or unsupported-session behavior.
5. Engineering initialization loads `setup-matt-pocock-skills`; it does not
   enter native file preview, directory creation or dependency installation.
6. Missing/disabled skills retain existing catalog, activation and permission
   behavior, without silent fallback to another skill or literal execution.
7. The home and conversation entry use localized, keyboard-accessible controls
   and compact wrapping at narrow widths.
8. Retiring the former workbench presentation preserves old histories,
   initialization backups and strict Workflow acceptance behavior.

Implementation synchronizes the product and E2E specifications and verifies the
public Composer interaction and existing Host recovery boundaries.

## Requirements split button

Discuss requirements is the fixed primary action. Its adjacent arrow opens a
menu containing Form specification and Split tickets. Selecting either inserts
the corresponding skill and closes the menu without changing the primary action.
Escape and outside clicks dismiss the menu; disabling the Composer closes it.
The group wraps as one unit at narrow widths. Existing draft and manual-send
semantics remain unchanged.
