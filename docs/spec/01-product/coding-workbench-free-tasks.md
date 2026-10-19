# Coding Workbench Skill Shortcuts

- Date: 2026-10-03
- Status: 0.16.2 release candidate.
- Authority: User-confirmed [interaction design](../../project/skill-shortcuts-interaction-design.md).
- Audience: Developers using PI-Desktop for coding work.

## Current Coding Actions contract

The primary Requirements button opens a menu with both modes.
Text uses the configured `grill-with-docs` action, including its saved prompt.
Visual prepares topic entry in the external Composer. Manual Send submits the
initial interview through the existing native prompt path, materializing a
Session when needed, then reveals the correlated panel. Opening the dropdown
neither changes the draft nor submits. Escape and mode selection close the menu.
Create specification and Create tickets remain in More.

Compile is a separate built-in plain prompt button. It detects project build
conventions and prepares compilation instructions, preserving the existing draft
and attachments and waiting for manual Send. All other launcher actions append
an instruction forbidding compilation, builds and packaging during that action;
focused non-build checks remain available. Existing saved prompts are never
rewritten. Commit prepares version-control inspection and commit instructions
without automatically compiling. Tooltips keep their usage and example content
without fixed “When to use” / “Example” prefixes.
The optional next-step recommendations remain available independently.
A correlated pending native interview response in the active Session reveals
the wide responsive panel once; unrelated replies never trigger it.
Native follow-up replies accept tagged or complete bare JSON under the same
request/question identity and schema checks. Invalid intermediate replies do not
stop listening for a later valid response; matching answers appear in the selected
question's thread without altering confirmed decisions.
Bounded reply parsing also extracts objects from Markdown fences or surrounding
prose and repairs trailing commas, single-quoted strings, unquoted property names
and raw control characters inside strings. Missing outer tags are tolerated.
Snake-case request/question IDs and scalar recommended-option strings normalize
to the existing schema; missing kind is inferred only from an existing payload
field. IDs, answers and decisions are never invented. Conflicting aliases,
multiple matching objects, truncated content and invalid schemas remain rejected.
After an invalid structured result, the panel automatically retries only when
the matching native attempt has ended successfully and is no longer running.
At most three additional automatic attempts are allowed. Each uses a new request
ID with a persisted retry count, retaining the topic, question and confirmed
decisions. Waiting, failed/cancelled turns, storage/send errors and other Sessions
never trigger retries. Exhaustion remains visible with an explicit manual retry.
Native interview text, question choices, recommendations and discussion replies
support native text selection and copying; action controls retain shell behavior.
Long question descriptions and options scroll independently in the left pane.
The Agent recommendation and confirm/defer/reopen controls remain in a fixed
footer below that scroller. Long recommendation rationale scrolls within the
recommendation card so the decision controls remain visible.
Interview navigation follows the settled-question state: Finish is disabled
until an empty questions response confirms exhaustion; Next round is disabled
after exhaustion. Open questions must be confirmed or deferred before either
action. At the existing 100-question safety limit, settling the round enables
Finish instead of another round. Inline guidance describes the available action.
Accept all recommendations (automatic) explicitly authorizes accepting pending
and deferred recommendations, requesting subsequent rounds, and finishing when
no further questions remain. Already confirmed decisions remain unchanged.
Single/multiple recommendations must reference valid options. Invalid cached
recommendations, send/storage errors, exhausted response retries and a Session
switch stop automation. Stop automatic interview or closing the panel prevents
future automatic actions; an already submitted request may still complete.
Automatic mode is panel-local and does not silently resume on reopening.
Each native question always offers Other (write your own), independently of
Agent-provided options. Selecting it reveals a per-question answer editor; blank
text cannot be confirmed. Single-select replaces the selected fixed option,
while multi-select permits combining Other with fixed options. Custom text is
bounded, persisted as optional question metadata and included in summaries,
follow-up context and specification handoffs. It requires explicit confirmation
and cannot be overwritten after confirmation without reopening the question.
When a questions response contains an empty list, retain previous questions and
decisions and display No further questions. Please finish the interview. This
state survives panel reopening, clears when a later round adds questions, and
does not automatically finish the interview.

Completed native interviews recommend Create specification. A successfully ended
to-spec turn recommends Create tickets or Implement; to-tickets recommends
Implement; implement recommends Code review. Code review findings or an unclear
outcome recommend the primary Fix code review findings button. Only an explicit clear review (an empty structured findings array,
without an incorrect verdict, or a standalone English/Chinese no-findings
conclusion) recommends Commit code. Priority-tagged findings take precedence
over a clear conclusion. Unknown prose is never assumed to be a clean review.
Fix code review findings is an always-visible primary plain-prompt button immediately
after Code review. It starts disabled and becomes available only after an actual
completed code-review turn in the current conversation; clicking Review alone,
streaming/failed replies, running turns and switching to an unreviewed conversation
do not unlock it. The latest review supersedes earlier reviews. It carries a local
extractive handoff of the final review answer (350 characters)
and latest user clarification plus a completed assistant answer from that same turn
(240 characters), excluding tool output. Unanswered, failed or interrupted followups
never reuse an earlier turn's answer. A completed review remains available for Repair
even if fenced-only output leaves the extract empty; `null` alone means unavailable.
The concise default instruction verifies the latest review and follow-up discussion,
consults the original conversation when unclear, fixes only confirmed defects with
minimal changes, adds regression coverage and validates the user path. Report only
fixes, rejected/unresolved findings and validation briefly; do not repeat a detailed
review inventory before fixing. Existing draft/attachments and manual Send remain.
Completed repair requests recommend Code review again. The localized leading
repair heading identifies this plain-prompt action; editing that heading may
remove the optional next-step hint. Saved Skill/prompt configuration is retained.
These are optional next actions, not workflow prerequisites or acceptance claims.
Recommendations highlight the existing action buttons rather than add another
row. When a recommended Skill lives in More, both More and its menu item receive
the highlight and an accessible recommendation description. Existing labels,
availability checks and saved configuration remain unchanged.
Only the latest user turn's leading native Skill command or built-in repair
heading qualifies.
Skill identity is read from the persisted original `command` when present;
expanded model-facing `content` is used only for legacy rows without a command.
Successful native turn results qualify; running, failed, cancelled or unrelated turns do not qualify.
An explicitly complete, non-error final assistant answer also qualifies after
recovered tool failures or history restoration without a live turn result. A
final error, streaming reply or running Session never qualifies. This fallback
offers navigation only and does not certify the generated artifact or review.
Selecting a recommendation carries a local extractive handoff of at most 600
Unicode characters (up to four bullets, each at most 145 characters). It uses
the first user-goal line after removing an exact known launcher instruction
(all shipped languages and current custom prompts), plus the final assistant answer;
manual requests are not split at arbitrary paragraph boundaries;
it omits intermediate replies, tool output and fenced code, deduplicates lines,
and prioritizes unresolved work, decisions and artifact paths over prose.
Markdown headings stay attached to their qualifying content, with per-item budgets
that retain body excerpts. Literal asterisks, inline code and glob scopes remain
verbatim; dangling headings are omitted rather than treated as conclusions.
Ellipses mark shortened excerpts. This is a navigation aid, not a complete
record or inferred acceptance: the full conversation remains authoritative.
No extra model call, persistence or automatic submission is introduced. Existing
draft text and attachments remain verbatim, outside the summary budget.
Commit uses the configured plain-prompt action with the no-build instruction; recommendations never send, commit or push automatically.

More groups available Matt skills by Requirements and exploration, Design and planning, Development and testing, Review and maintenance, and Collaboration and delivery. Unknown configured overflow appears under Custom actions. Empty groups are hidden. Grouping is presentation only: no stage prerequisites, execution order, or persisted configuration changes.

The configurable Registry presents six default actions: Discuss requirements,
Create specification, Technical design, Create tickets, Implement and Code review.
Initialize (`setup-matt-pocock-skills`), Ask next step (`ask-matt`) and Diagnose bug (`diagnosing-bugs`) remain visible
alongside the first six other enabled configured actions. More is always visible
with Initialize first, immediately before Ask next step. Initialize never appears
in More, including when an existing profile has duplicate initialization actions.
and exposes remaining enabled configured actions plus installed Matt skills from
the shared engineering shortcut list, excluding skills already configured (including
disabled entries). Matt labels and guidance are localized; imagegen and unrelated
catalog skills are excluded. Existing configured common
entries retain their labels, prompts and enabled state; no profile rewrite is
required to restore the entry points. Missing skills remain visibly unavailable. Known engineering skills use localized
two-line launcher tooltips without fixed usage/example labels on primary
and More entries; raw catalog descriptions are fallback only for unknown skills.
Configured descriptions remain verbatim in settings and provide the launcher
tooltip's usage line when present.
Except for the `implement-spec` viewer entry, selecting an action prepares an editable Composer draft and never
submits. Undefined/null instructions use the localized engineering prompt matched
by skill id; explicit empty instructions retain the native marker plus the launcher no-build
instruction. Custom instructions remain verbatim with that appended instruction. Unknown custom skills have no built-in instruction.
Existing text and attachments survive. Manual Send uses the native skill path.

Extension settings show the effective localized instruction in the prompt editor,
with an explicit default, custom, marker-only, or no-built-in-prompt status.
Viewing defaults does not persist overrides. Editing creates an explicit custom
instruction, including an empty string for marker-only insertion. Restore default
prompt sets only the selected Action's instruction to null and takes effect on
Save; it does not reset other Action properties. Skill changes resolve defaults
by the new skill id while preserving explicit custom instructions. The description
editor displays the same built-in guidance or catalog fallback as the launcher
unless an explicit nonempty Action description is configured.

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
manual Send behavior remain unchanged. Opening More
does not insert instructions. Ask inspects current project evidence and proposes
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

The Ask button inserts `ask-matt`. The More menu exposes curated engineering shortcuts:
`implement-spec`, `pr`, `grilling`, `handoff`, `prototype`, `improve-codebase-architecture`,
`codebase-design`, `domain-modeling`, `tdd`, `research`, `resolving-merge-conflicts`,
`wizard`, and `writing-for-agents`.

Specialized or niche skills remain available through the catalog, subagents and slash commands
without cluttering the More menu. Each exposed shortcut has localized labels, instructions and
usage guidance. Except for `implement-spec`, these entries follow the same editable-draft and
manual-Send contract, including skills whose eventual execution requires an external CLI such
as Claude Code.


The primary wrapping row presents Initialize, Ask, Requirements, Implement,
Code review, Repair, Diagnose bug, Commit, Compile, Continue, then More.
Chinese labels are shortened for this toolbar; Requirements offers Text discussion
and Visual discussion in its existing dropdown. Saved custom prompt names remain
unchanged. Additional configured prompt actions still follow Commit.
A localized Collapse shortcuts / Expand shortcuts button controls both rows
as one unit. The toolbar starts expanded and keeps its state for the current
component lifetime. Collapsing closes launcher menus, preserves the Composer draft
and attachments, and leaves errors and active work panels available.
The second row retains its document workflow actions.
Interaction image prompt, Ordinary discussion, Create specification and Create
tickets live in More. Selecting Interaction image prompt closes More and inserts
an editable prompt, preserving the existing Composer draft and attachments.
Settings remain accessible through Extensions.
The default Commit code button prepares an editable, localized commit prompt without compilation with no Skill dependency. It preserves existing Composer text and attachments; only manual Send executes the prompt. Git (including GitLab hosting) and SVN are supported by the default instruction; unexpected inspection failures forbid commit. Git push is permitted only when the user explicitly requests it. The Engineering Workflow entry is no longer exposed.

Extensions > Coding Actions includes a separate Plain prompt buttons editor.
Names, instructions, enabled state and order are editable; buttons can be added
or deleted. Save, Cancel, backup, import/export and reset cover both lists.
Viewing defaults does not persist overrides. Restoring the Commit code prompt
keeps its customized name and uses the current locale's default instruction.
Plain prompts do not require the Skill Catalog and never add a Skill marker.
The schema-version-1 configuration accepts an optional `promptActions` list;
an absent list preserves the localized Commit code default without rewriting
legacy files, while an explicit empty list hides all plain prompt buttons.
Each list supports up to 256 entries. Names and custom prompts must be nonempty,
with limits of 128 and 16000 characters. `prompt: null` is permitted only for
the built-in `commit-code` entry. Older app versions cannot read configurations
containing `promptActions`; the saved pre-edit backup supports downgrade recovery.
More groups skills into Requirements and exploration, Design and planning,
Development and testing, Review and maintenance, and Collaboration and delivery
(including Retrospective). Every skill remains available exactly once.
All shortcuts use regular text. At narrow widths the unified row wraps
without horizontal overflow; order stays fixed across task states.

## Requirements confirmation

Coding Actions no longer exposes the separate Confirm requirements action.
Historical Workflow confirmations remain stored, but their native UI entry points are withdrawn.
See [Requirements Confirmation](requirements-confirmation.md) for content-version
approval, history and freshness rules. Existing skill shortcuts retain the
draft-only behavior described above.

## Global instruction settings

Composer skill buttons, More, visual requirements, and prompt/Commit actions
show concise localized tooltips with exactly two lines for usage and an example, without fixed labels. They use the shared portal tooltip on pointer hover and keyboard
focus; it wraps within the viewport. Reading a tooltip does not change the
draft or execute a skill. Clicking dismisses it and retains the existing draft
insertion behavior. Buttons retain short accessible names and expose their
guidance as accessible descriptions. Missing-Skill and runtime errors remain in
the separate status/error area rather than the concise hover text.

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
waiting-task dispatch with ordinary chat. Retain historical Engineering Workflow data and Host contracts without exposing
the withdrawn native Work Panel. No Host schema,
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

## implement-spec task graph viewer

Selecting a Coding Workbench action whose skill ID is `implement-spec` opens a
local task graph viewer rather than inserting a Skill prompt. Other shortcuts
retain editable drafts and manual Send. Existing CodingAction profiles and their
schema remain unchanged, including any saved custom prompt.

The user pastes `{ "tasks": [{ "id": "task", "title": "Title", "status":
"pending", "blockedBy": [], "url": "https://example.com/task" }] }`. `blockedBy`
and `url` are optional. Status is `pending`, `running`, `done`, or `aborted`.
Inspection rejects malformed input, duplicate IDs, unknown dependencies, cycles,
unsafe URLs, more than 1,000 tasks, and more than 1,000,000 characters. URLs are
shown as text and are not fetched. The pending frontier contains only tasks whose
dependencies are all done. It is informational, never a dispatch queue.

The viewer has no scheduler, issue-write path, automatic task closure, model
execution, or persisted task graph. Updating input clears stale results. Closing
is explicit; no task completion event closes the viewer. The viewer shows
separate descriptive gate metadata; concise Skill tooltips omit gate details.
Actual safety
constraints remain enforced by CLI permissions or Hooks; metadata grants no
permission and does not change the CodingAction schema.


## Bundled document actions

The second row is fixed in this order: Requirements document, Overall design,
High-level design, API documentation, Database design, and Merge and convert
format. Test plan and Test report are removed from this row; no placeholders
remain. API documentation uses `api-integration-docs` and Database design uses
`database-design-doc`.
Chinese labels are defined by the shipped i18n catalog.

Requirements, overall design, high-level design, API documentation, database
design, merge and conversion use the
application-owned `pi-desktop:` Skill IDs. Complete Skill directories (including
front matter descriptions, references, agent metadata and conversion scripts)
ship under `resources/skills`, recursively included in every desktop package.
The existing built-in Skill catalog and Skill-tool loader expose them immediately,
including existing profiles, without imports, downloads or paths on the author's
machine. User-owned skills and profile-managed engineering bundles remain intact.

Selection prepares an editable native Skill draft, preserves existing text and
attachments, and requires manual Send. Overall/high-level design collect missing
source paths and references according to their bundled workflows. Merge and
convert first collects the document inputs, user-specified title and template or
format, then merges and reviews content before loading
`pi-desktop:markdown-to-docx` for conversion and verification. Selection does not
execute a conversion or install tools. Converter runtime dependencies (Python,
Pandoc and applicable diagram/render tools) are checked when conversion is
requested; missing tools remain observable and installation requires permission.

API documentation reconciles source code, project requirements/designs and
references into Markdown suitable for independent third-party integration.
Database design reads project SQL (preferring `_pkg/linux/bin/*db`), migration
chains and supporting source to reconstruct the documented database baseline.
Both actions only prepare drafts; their workflows generate documentation without
changing APIs, connecting to databases or executing SQL.

## Continue interrupted work

The Continue button follows Commit code (or remains available when that action is hidden). It prepares a localized editable prompt to check conversation context and actual progress, resume unfinished work and preserve agreed requirements and existing changes. Existing drafts and attachments are retained. It does not submit a turn automatically and follows the launcher blocked state.
