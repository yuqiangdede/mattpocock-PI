# PI-Desktop

Local-first AI coding agent desktop client.

**Electron shell + Rust host core + pi Agent Harness + plugin system.**

## Current status

MVP implementation is in progress with a working app skeleton, host-core, agent runtime, and protocol-level e2e coverage.

- Specs: `docs/spec/`
- ADRs: `docs/adr/`
- App: `apps/desktop`
- Host: `crates/host-core`
- Example plugin: `examples/plugins/hello`

Baseline: **`0.3.4`**

## Key decisions

| Area | Choice |
|---|---|
| Desktop shell | Electron |
| UI | React + TypeScript + Vite + Tailwind |
| Default language | English (i18n-ready) |
| Host backend | Rust |
| Agent engine | pi (`pi-ai` + `pi-agent-core`) |
| Agent placement | Node sidecar |
| Extensions | user-installable plugins |
| Host RPC | stdio JSON-RPC (NDJSON) |
| DB owner | Rust host-core |
| Default mode | Agent (Chat read-only) |
| First release | macOS arm64 |
| Marketplace | Postponed (protocol only) |

## Docs

Start here:

1. [Baseline](docs/spec/00-baseline.md)
2. [Spec index](docs/spec/README.md)
3. [Architecture](docs/spec/02-architecture/01-architecture.md)
4. [Rust host core](docs/spec/03-runtime/05-host-core-rust.md)
5. [Plugin system](docs/spec/07-plugins/01-plugin-system.md)
6. [Milestones](docs/spec/06-delivery/01-mvp-milestones.md)
7. [AI dev workflow](docs/spec/06-delivery/03-ai-development-workflow.md)
8. [E2E test plan](docs/spec/06-delivery/04-e2e-test-plan.md)

Agent instructions: [AGENTS.md](AGENTS.md)

## Repo layout

```text
PI-Desktop/
├── apps/ # Electron app (to implement)
├── crates/ # Rust host-core (to implement)
├── packages/ # shared TS packages (to implement)
├── examples/plugins/ # sample plugins
├── docs/spec/ # product/architecture specs
├── docs/adr/ # architecture decision records
└── scripts/
```

## Development status

- [x] Baseline specs
- [x] Plugin system specs
- [x] English-first policy
- [x] Rust host-core architecture
- [x] Private GitHub repository
- [x] M1 app skeleton
- [x] M2 pi chat runtime (streaming + provider settings + secrets)
- [x] M3 workspace tools (Read/Glob/Grep/Write/Edit/Bash + permissions)
- [x] M4 plugin foundation (local/dev load, commands, tool registration)
- [x] M5 packaging scaffold (macOS arm64 dir build; signing/notarization later)

### Quick start

```bash
# build host-core
cargo build -p host-core

# install js deps
pnpm install

# build packages + electron app
pnpm -r --if-present build

# dev
pnpm dev

# protocol e2e smoke
PI_DESKTOP_TEST_API_KEY=... pnpm test:e2e
```

## CI / Release

GitHub Actions:

- **CI** (`.github/workflows/ci.yml`) — every PR and push to `main`: JS build / typecheck / lint / unit tests + `cargo test`.
- **Release** (`.github/workflows/release.yml`) — builds native-host installers
  for macOS (dmg, arm64), Windows (NSIS, x64), and Linux (AppImage + deb,
  x64). Tag builds publish only the D010 macOS artifact; Windows/Linux remain
  downloadable Actions artifacts for shell-readiness testing.

Cut a release:

```bash
node scripts/release.mjs 0.2.0 --tag   # bump all versions + commit + tag v0.2.0
git push origin main v0.2.0            # push tag → Release workflow builds & publishes
```

## Principles

1. pi is the agent engine; PI-Desktop is the product shell
2. Rust owns privileged host capabilities
3. Renderer is unprivileged
4. English is the source language
5. Plugins are powerful but default-deny
6. Local-first MVP before remote/control-plane features

## License

TBD
