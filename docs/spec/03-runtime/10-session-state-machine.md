# 10. Session State Machine

## 1. Session status

```text
idle ⇄ running ⇄ waiting_permission
          ↘ aborted
          ↘ error
```

| status | meaning |
|---|---|
| `idle` | no active turn |
| `running` | model/tool turn active |
| `waiting_permission` | blocked on user permission decision |
| `aborted` | terminal for current turn (then returns idle) |
| `error` | terminal for current turn (then returns idle) |

## 2. Turn lifecycle

```text
accept_prompt
 → turn_start
 → streaming
 → (optional tool_loop)
   → permission_maybe
   → tool_exec
 → turn_end
```

## 3. Transition rules

1. Only one active turn per session
2. New prompt rejected with `AGENT_BUSY` while running/waiting_permission
3. Abort from running or waiting_permission is allowed
4. Permission timeout moves to tool denied, then agent may continue or end based on runtime handling
5. Session status returns to idle after terminal turn states are persisted
6. Changing the renderer's active project/session does not transition or abort
   any background session
7. A tool transition retains the originating session's persisted project root;
   it never adopts the newly active project's root
8. `session.endTurn` moves only a `running` turn to terminal. In that same
   transaction, unseen `completed` inserts `task.completed`, unseen `error`
   inserts `task.failed`, and a result already visible in the focused current
   chat or any `aborted` turn inserts no notification (D117). Repeated terminal
   calls are no-ops.

## 4. Persistence points

- user message: on accept
- turn run row: on start + terminal `session.endTurn` update
- notification row: same transaction as an unseen completed/error terminal
  update; never for a visible-current result or abort
- assistant/tool messages: on message_end/tool_end
- mode/project fields: on change

## 5. Acceptance

1. Busy session cannot start second concurrent turn
2. Abort is idempotent
3. waiting_permission is visible in UI status
4. sessions in two retained project tabs may run independently without
   transcript-event or workspace-root crossover
5. each unseen completed/failed turn produces exactly one notification record
   while a visible-current result or aborted turn produces none
