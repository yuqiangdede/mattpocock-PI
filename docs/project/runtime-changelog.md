# Runtime changes (unreleased)

## 2026-10-19 — Empty-response recovery

- Retry a response with no visible text or tool call up to ten times before
  showing an error, preserving the same assistant bubble. A new prompt starts
  a fresh budget, and Stop still cancels recovery.
- Explain the exhausted ten-retry budget in every shipped locale. Network
  retry settings and completion-notice silence exemptions retain their behavior.
