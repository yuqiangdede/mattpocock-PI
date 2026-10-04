# Executable updates validation — 2026-10-05

- Candidate branch: `codex/settings-executable-updates`; the exact tested head
  is recorded in the pull request's task-candidate validation evidence.
- Base main: `53d0f063ad93f266843b46434e3ab9e0e0b9d015`.
  A final fetch confirmed the same `origin/main`.
- Environment: Windows, Node 24.15.0, existing host development tools and
  dependency links; no separate runtime was provisioned for E2E.

## Results

| Check | Result |
| --- | --- |
| Shared / i18n builds and Desktop TypeScript check | Pass |
| Desktop electron-vite build | Pass |
| Targeted update / skill / cache / timeout Node tests | 45 pass; 1 skipped |
| `cargo test -p host-core --locked` | 752 pass |
| `cargo fmt --check` | Pass |
| `cargo clippy -p host-core --all-targets --locked` | Pass, existing warnings |
| Style token and agent policy checks | Pass |
| `node scripts/e2e-executable-updates.mjs` | Pass |
| `node scripts/e2e-electron-boot.mjs` | Pass |
| `git diff --check` | Pass |

The Node skip is the release-workflow source check: this fork has no configured
release workflow. Live public release metadata was inspected separately:
`v0.16.0-beta.2` contains an NSIS `latest.yml`, the Setup executable/blockmap,
Portable executable/ZIP, and published SHA256 digests. No live release package
was downloaded or installed.

The update E2E uses real Host RPCs for update/restore, running-turn rejection,
installer admission/cancellation and channel persistence. It mounts the production
React update component in a separate sandboxed Electron window with a fixture IPC
boundary and built production CSS. Clicks cover check-all, channel selection,
skill update/restore, preservation reporting, task blocks, explicit download/
restart and Portable guidance. DOM state and control geometry are recorded.
The fixture server, Electron process, Host and debugger ports are closed.

The boot smoke launches the actual built Desktop with an isolated profile.
It verifies preload IPC, responsive session listing and normal process exit.

## Limits and compatibility

- Real NSIS replacement, signing and clean-VM upgrade remain release qualification
  steps. Controller tests substitute the external installer transport.
- Hidden-window screenshots proved unreliable in this environment. They are
  excluded from the final E2E gate; DOM interactions, geometry and full boot are
  the recorded acceptance evidence. Earlier Chinese layout renders were inspected.
- Bundled skill manifests upgrade from version 1 to version 2. Existing version 1
  catalogs remain readable; Host binaries supporting only version 1 cannot read
  an upgraded catalog. User global/project files are not migrated or overwritten.
- Release publication and changes to the user's installed app are outside this
  code-delivery scope. Git delivery is recorded separately through the PR.

Temporary logs and fixture artifacts are retained under the ignored
`.pi-desktop-test` directory in this request worktree.

A dependency-link setup error briefly triggered the pnpm launcher's automatic
bootstrap of an ignored local dependency tree. That run was stopped; links were
repaired to reuse the existing patched dependencies. Dependency manifests and
the lockfile remain unchanged.
