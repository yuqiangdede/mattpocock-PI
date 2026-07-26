# 07. Process Model

## 1. Processes

MVP target topology:

```text
PI-Desktop.app
├── Electron Main
│   ├── Renderer (React UI)
│   ├── Rust host-core sidecar
│   └── Node pi agent sidecar
```

## 2. Ownership

| Process | Owns |
|---|---|
| Electron Main | window lifecycle, IPC fan-in/out, child process supervision |
| Renderer | UI only |
| Rust host-core | DB, tools, permissions, plugin host services, secrets adapters |
| Node pi sidecar | pi agent loop, provider streaming, tool-call planning |

## 3. Boot order

1. Electron main starts
2. Load English locale defaults
3. Spawn Rust host-core
4. `app.handshake` with host-core
5. Spawn Node pi agent sidecar
6. Connect agent sidecar tool-bridge to host-core via main
7. Create main window / renderer
8. Renderer performs `app/getVersion` healthcheck through main

If step 3–4 fails: block app with recovery message.

## 4. Crash policy

| Crash | Policy |
|---|---|
| Renderer crash | reload window, keep host/agent processes |
| Rust host crash | mark app degraded, attempt restart host, fail open sessions gracefully |
| Node agent crash | abort active turns, restart sidecar, preserve DB state in Rust |
| Electron main crash | full app exit |

Supervision parameters (implemented in Electron main):

- Child exit rejects all in-flight RPCs for that child immediately (no 130s timeout wait).
- Auto-restart with exponential backoff `0.5s → 1s → 2s` (cap 4s).
- At most **3 restarts per 2-minute window** per child; beyond that the app
  stays degraded and emits `hostStatus { ok: false, component, fatal: true }`.
- Renderer is notified on every transition via the `hostStatus` event:
  `{ ok, component?: "host" | "sidecar", restarting?, restarted?, fatal?, message? }`.
- Intentional shutdown (quit/dispose) never triggers restart.

## 5. Shutdown order

1. Reject new prompts
2. Abort active turns
3. Unload plugins
4. Stop Node agent sidecar
5. Flush/close Rust host DB
6. Stop Rust host
7. Close windows / exit

## 6. Dev vs release

### Dev
- Electron via electron-vite
- Rust via `cargo run` binary path
- Node via system Node (`>= 22.19`)
- `desktop` `predev` rebuilds `packages/agent-runtime/dist` before host-core
  and Electron startup; Electron must never spawn a stale ignored sidecar
  artifact from an earlier source revision

### Release
- package Electron app
- ship Rust host binary in resources (`Resources/bin/pi-desktop-host-core`)
- agent sidecar runs the bundled `agent-runtime/sidecar.js` on the Electron
  binary itself with `ELECTRON_RUN_AS_NODE=1` — no separate Node runtime is
  shipped (resolves **D008**)

## 7. Acceptance

1. Clean boot path documented and scriptable
2. Host crash does not silently continue tool execution
3. Agent crash does not corrupt SQLite
