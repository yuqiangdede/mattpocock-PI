# Native Grill Workspace (Stage 1)

## Scope

Stage 1 exposes a direct Visual requirements discussion button. Ordinary
Requirements discussion, Create specification and Create tickets live in More.
There is no discussion-mode dropdown or browser-mode entry. Installed Skills
remain available through the normal catalog.
The primary button prepares topic entry in the external Composer. Manual Send
submits the first round and opens the panel with the topic already loaded, using
the existing native Session admission path. A saved interview can be reopened
using Open existing discussion without another send. The panel automatically reopens when
a matching pending interview response arrives in the active Session. Unrelated
responses do not open it, and closing an already handled result is respected.
Its wide two-column layout overrides generic dialog sizing and stacks on narrow screens.

The native view implements:
- A first round of 1–3 Agent-proposed, option-based questions, with recommendations.
- Single- and multi-select choices, with explicit confirmation, defer and reopen.
- A **right-side discussion thread belonging to the selected question**.
- Follow-up answers that **never silently confirm or override an answer**.
- An explicit "Next round" action once all open questions are settled.
- An explicit Finish action asking the Agent to write a design document.
- Guided navigation: settle the current round before Next; Finish is available
  only after no further questions remain (or the existing 100-question cap).
- An explicit automatic acceptance action that preserves confirmed decisions,
  accepts remaining recommendations and advances rounds through Finish. Stop,
  close, Session switch or failures prevent further automatic actions; opening
  the panel again never implicitly resumes automatic mode.
- Local versioned state for interview drafts and question threads, including
  a pending operation identifier so results can be reconciled after reopening.

## Transport and correlation

Native Grill Workspace does **not** rely on a Node local web server, browser
POST endpoints, a persistent Monitor, foreground `wait` tool call, or manual
`/grill-with-ui resume` action.

Each interview operation is an ordinary user turn sent through the existing
`useAppStore.sendPrompt` path, which already handles local or remote Pi sessions,
busy-session queuing and Host transcript persistence. The operation includes
a unique `requestId`. The Agent returns a bounded JSON envelope in the
`<grill-workspace-result>` tag, also carrying `requestId`.

The renderer only accepts a response with the matching operation and question
identifier. It never takes the most recent unrelated assistant text as a
question response. The same request cannot be applied twice. A one-at-a-time
queue per interview prevents accidental reordering.

The Host transcript remains the authoritative record of messages and Agent
execution. The native interview's renderer-owned, versioned localStorage record
is an independent *local UI checkpoint*, not a replacement Session database.
The record is scoped by Host Session ID and contains the visible questions,
choices, threads, and one pending request. Reopening reconciles matching
responses from the Host transcript. A failed local write is surfaced, not
silently treated as durable persistence.

## Known limits in this first PR

- The native mode does not yet include Visualize, per-option deep comparisons,
  or a cross-device synchronized interview state.
- Model responses may use the structured envelope or a complete bare JSON object,
  both with the same bounded schema, request and question identity validation.
- Minor syntax deviations are repaired locally before the same schema validation:
  Markdown/prose wrappers, missing outer tags, trailing commas, single quotes,
  unquoted property names and raw string newlines. Matching IDs remain mandatory;
  ambiguous, conflicting or incomplete objects are rejected without inventing data.
  An invalid response does not stop subsequent reconciliation; a late valid reply
  clears the error and appears in its question's thread. A malformed response
  produces an explicit recoverable error, not a silently accepted decision.
- The renderer cache may be cleared by deleting application browser storage;
  the original prompts and replies remain available in the Host transcript.
- Host transcript retrieval is bounded to the newest 120 messages, so
  exceptionally long interrupted interviews may need a manual recovery path.
- This PR does not modify the original Skill, Pi session ownership, core
  lifecycle, Host storage schema, permissions, or remote transport.

## Manual acceptance

1. Start an ordinary Pi session, click "Visual requirements discussion"
   then enter a topic in the external Composer and Send. Verify 1–3 options with recommendations arrive in the left pane.
2. Select Q1, send two follow-ups from the right pane. Verify Q1 contains both
   user messages and Agent replies; Q2 remains untouched.
3. Confirm a non-recommended answer in Q1; send another follow-up.
   The confirmed answer must remain unchanged.
4. Select Q2 and reopen Q1. Switching must not leak drafts or discussion
   messages into a different question.
5. Defer one question, confirm the others and request the next round.
   Check stable IDs and preserved historical choices.
6. Close the panel with a pending operation and reopen it; the request must
   remain visible and reconcile its eventual Host response.
7. Switch sessions while the panel is open. Sending must be blocked rather
   than silently target the new session.
8. Deliberately return invalid JSON or an incorrect request ID.
   The panel must display a recoverable error and leave decisions intact.
9. Verify the direct visual entry and the three relocated More entries.
   Close a pending interview, receive its matching response and verify automatic
   reopening. Unrelated responses must not open it; closing the handled result
   must remain effective. At desktop width, verify the dialog exceeds 440px.
10. Repeat the common path in local and remote sessions, then finish the
    interview and verify any document path reported is actually present.

## Automated coverage

`apps/desktop/test/grill-workspace-model.test.mjs` exercises protocol validation,
stable IDs, isolated threads, explicit confirmation, defer/reopen, restart
checkpoints, and finishing semantics. Renderer E2E and model-integrated tests
are still required before claiming full acceptance.
