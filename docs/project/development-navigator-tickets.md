# Development Navigator Ticket Proposal

Date: 2026-10-07
Status: Six-ticket breakdown and primary test seam accepted; published as #47–#52.
Source: Accepted product discovery and the first-release specification.
Tracker: GitHub, yuqiangdede/mattpocock-PI; label ready-for-agent.

## Published issues

Specification: [#46](https://github.com/yuqiangdede/mattpocock-PI/issues/46).

| Slice | Issue | Blocked by |
| --- | --- | --- |
| 1. Record engineering work | [#47](https://github.com/yuqiangdede/mattpocock-PI/issues/47) | None |
| 2. Multi-round activity boundaries | [#48](https://github.com/yuqiangdede/mattpocock-PI/issues/48) | #47 |
| 3. Results and evidence | [#49](https://github.com/yuqiangdede/mattpocock-PI/issues/49) | #47 |
| 4. Analysis-only ask-matt | [#50](https://github.com/yuqiangdede/mattpocock-PI/issues/50) | #48, #49 |
| 5. Suggested follow-up drafts | [#51](https://github.com/yuqiangdede/mattpocock-PI/issues/51) | #50 |
| 6. History management | [#52](https://github.com/yuqiangdede/mattpocock-PI/issues/52) | #47 |

All seven issues were read back and verified open with ready-for-agent. Connected
tools expose no native blocking-link operation; ticket bodies carry real blocking
issue references. No parent issue was modified or closed during ticket publication.

## Slicing rules

Each ticket delivers a narrow user-visible path through contracts, Host state,
native integration, Renderer, i18n, and tests as needed. Do not separate database,
API, and UI into independently unusable tickets. Every slice includes its own
ownership, cancellation, compatibility, and regression coverage; safety is not
deferred to a final test ticket. Implementation and Git delivery require separate
authorization. The specification's primary user-path test seam was accepted
with this breakdown.

## 1. Record submitted engineering work in Navigator

Blocked by: None. Published issue: #47.

Deliver an optional conversation-scoped Navigator tab where actual native
button/slash submissions create an activity with its initial request and truthful
execution outcome. Persist and restore that minimal path through Host ownership.

- Recognize actual submitted intent, including multiple Skills; unsent or removed
  markers and unrelated ordinary chat do not create activities.
- Distinguish requested identity from actual-use evidence; absent evidence stays
  unknown. Do not fabricate independent per-Skill outcomes.
- Show empty state and waiting/running/normal/failed/cancelled/unresolved request
  outcomes. Normal termination never implies approval or activity ending.
- Restore records after restart without replay; preserve old/unknown data and
  current Chat, Composer, Actions, native Skills, and legacy Workflow data.
- Cover the public submission-to-visible-record path and duplicate/stale events,
  conversation switching, restore, accessibility, and localized copy.

Acceptance mapping: NAV-01, NAV-02, NAV-04, NAV-06.

## 2. Continue and explicitly end multi-round activities

Blocked by: 1 (#47). Published issue: #48.

Deliver a requirements discussion that spans several user/Agent rounds while
remaining one activity, with explicit continuation and ending boundaries.

- Ordinary answers can continue the selected activity without repeating a Skill
  marker; unrelated chat is not silently absorbed by proximity.
- Expose explicit continuation/ending controls; retain underlying requests and
  outcomes, and allow renewed discussion without erasing earlier history.
- Per-turn completion does not prompt for next steps or dispatch analysis.
  Ending does not approve content, complete a Workflow stage, or execute work.
- Persist activity boundaries and test restart, busy/late-event transitions,
  interleaved unrelated messages, and an actual multi-round requirements path.

Acceptance mapping: NAV-01, NAV-02, NAV-06, NAV-10.

## 3. Inspect and curate evidence-backed activity results

Blocked by: 1 (#47). Published issue: #49.

Deliver result inspection for a selected activity, starting from response links
and adding attributable file/validation references that users can correct.

- Open associated replies and allowed file references through existing readers.
  Missing files and unidentified results remain explicit.
- Keep provenance and distinguish model-reported checks from observed validation;
  uncertain associations remain marked for verification. No project-wide guessing.
- Add/remove references without deleting messages/files; persist corrections.
- Keep results associated with their originating activity across multi-round work,
  restart, conversation switches, failed reads, and delayed completions.

Acceptance mapping: NAV-03 (result inspection), NAV-04, NAV-06, NAV-08 (associations).

## 4. Request permission-enforced ask-matt navigation analysis

Blocked by: 2 (#48), 3 (#49). Published issue: #50.

Deliver the ended-activity → preview selected inputs → explicit ask-matt request
→ visible two-to-four suggestions/reasons or insufficient-evidence outcome path.

- Before coding, prove native analysis-only and selected-scope enforcement;
  present architecture alternatives if frozen boundaries must change. Prompt-only
  restrictions cannot satisfy acceptance. No parallel Runtime or hidden session.
- Use the current conversation/model and native permissions; admit only while
  idle, guard busy races and duplicate requests, and never steer/auto-queue.
- Preview request/response scope and deselect files; additional read scope needs
  explicit selection. Deny writes, builds/tests, commits, and recommended execution.
- Validate untrusted analysis output and Skill references; preserve full analysis,
  generation time, and basis under its activity, without recursive main-list items.
- Support cancellation and explicit retry while retaining prior suggestions;
  restore analyses without replay and flag old advice after new work.
- Test the public analysis path with an external model fixture, permission denial,
  malformed output, unavailable ask-matt, insufficient evidence, cancellation,
  duplicate admission, restart, and project/conversation switching.

Acceptance mapping: NAV-05, NAV-06, NAV-07, NAV-09, NAV-10 (explicit trigger).

## 5. Prepare suggested follow-ups with editable context

Blocked by: 4 (#50). Published issue: #51.

Deliver suggestion selection → editable native Composer draft → explicit Send,
carrying concise activity context while preserving the user's current input.

- Show suggested action, reason, and input basis; allow viewing full analysis.
  Recheck Skill availability and show settings remediation without auto-install,
  enablement, or substitution.
- Carry selected result references/summary into editable content without copying
  all chat history or claiming referenced files were read/current.
- Preserve existing text and attachments. Do not dispatch on selection, and do
  not write into another draft after asynchronous conversation/project changes.
- Run the representative multi-round discussion → end → ask-matt → prepare draft
  → Send path through real internal wiring, plus missing Skill and draft races.

Acceptance mapping: NAV-03, NAV-04, NAV-06, NAV-09 (no executable model authority).

## 6. Hide, restore, and delete navigation history safely

Blocked by: 1 (#47). Published issue: #52.

Deliver reversible activity hiding and conversation-owned cleanup while keeping
source messages, files, and execution histories safe.

- Hide/restore activities without source deletion; no extra independent retention
  beyond existing conversation deletion rules.
- Conversation deletion cleans associated activity metadata and any later-added
  associations/analyses through a shared lifecycle contract; later tickets must
  integrate with that contract rather than creating separate retention paths.
- Test active/late-event ownership, restart, idempotent cleanup, inaccessible or
  unknown stored data, and legacy history compatibility. Never replay work.

Acceptance mapping: NAV-06, NAV-08.

## Dependency frontier

1 can start first. After 1, tickets 2, 3, and 6 have independent prerequisites.
4 waits for 2 and 3; 5 waits for 4. These are development dependencies, not
runtime stage prerequisites. Primary test seam: Navigator/Composer user path;
add focused permission, attribution, persistence, and lifecycle contract tests.
