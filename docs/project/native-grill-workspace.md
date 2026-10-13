# Native Grill Workspace (Stage 1)

## Scope

Stage 1 adds a native visual interview to the existing **Requirements discussion** dropdown.
It deliberately leaves the original browser-based `grill-with-ui` Skill available as
"Browser mode (original Skill)". Both modes are independent.

The native view implements:
- A first round of 1–3 Agent-proposed, option-based questions, with recommendations.
- Single- and multi-select choices, with explicit confirmation, defer and reopen.
- A **right-side discussion thread belonging to the selected question**.
- Follow-up answers that **never silently confirm or override an answer**.
- An explicit "Next round" action once all open questions are settled.
- An explicit Finish action asking the Agent to write a design document.
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
- Model responses must obey the structured envelope; a malformed response
  produces an explicit recoverable error, not a silently accepted decision.
- The renderer cache may be cleared by deleting application browser storage;
  the original prompts and replies remain available in the Host transcript.
- Host transcript retrieval is bounded to the newest 120 messages, so
  exceptionally long interrupted interviews may need a manual recovery path.
- This PR does not modify the original Skill, Pi session ownership, core
  lifecycle, Host storage schema, permissions, or remote transport.

## Manual acceptance

1. Start an ordinary Pi session, open "Requirements discussion" -> "Visual discussion"
   and enter a topic. Verify 1–3 options with recommendations arrive in the left pane.
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
9. Use the original browser Skill option to verify backwards compatibility.
10. Repeat the common path in local and remote sessions, then finish the
    interview and verify any document path reported is actually present.

## Automated coverage

`apps/desktop/test/grill-workspace-model.test.mjs` exercises protocol validation,
stable IDs, isolated threads, explicit confirmation, defer/reopen, restart
checkpoints, and finishing semantics. Renderer E2E and model-integrated tests
are still required before claiming full acceptance.
