# Windows Release Acceptance

Date: 2026-10-03. Scope: local Windows x64 NSIS installation acceptance for
`0.16.0-beta.1`. This is not publication or cross-platform release approval.

## Candidate and artifact

- Request branch: `codex/windows-release-acceptance`, dedicated Codex worktree.
- Candidate and refreshed base main: `9db30f38261116459090c520951ee03bdcd41b7b`.
- Product code is unchanged. Working-tree changes correct stale English/Chinese
  E2E labels, allow the Workflow harness to select the shipped Host through
  `PI_DESKTOP_HOST_BIN`, ignore acceptance artifacts, and record this evidence.
- Installer: `apps/desktop/release/PI-Desktop-Setup-0.16.0-beta.1.exe`;
  size: 111,709,961 bytes; SHA256:
  `6007597eb0644aa48adc65dbcd1687665de94413288c7c8a2fcf7ed05baff933`.
- The installer is unsigned. Both compiled release and installed Host have
  SHA256 `8f3c0df3283523e23ee19e3c91c855d2c27823c343cc063c175661009e7e8ffb`.
- Host environment: Windows x64; Node 24.15.0; pnpm 12.8.1; Electron 43.6.0.
  Compatible primary-checkout dependencies and Cargo cache were reused by link;
  no second dependency installation was performed for E2E. pnpm's mutable task
  state is a real worktree-local directory rather than a shared junction.
- Existing initialization/startup remain documented in the root README;
  development startup is `pnpm dev`. Installed startup is `PI-Desktop.exe`.

## Release gates and executed tests

| Check | Result | Evidence under `cache/release-acceptance/` |
| --- | --- | --- |
| Release documentation, stable preview `0.16.0` | Passed | `release-docs.log` |
| Agent policy synchronization / refreshed main ancestry | Passed | Executed before build and ancestry rechecked after acceptance |
| Desktop dependency build, release Host, runtime bundle, Electron production build | Passed | `build-win.log` |
| Desktop typecheck / repository lint | Passed | `typecheck.log`, `lint.log` |
| JavaScript tests | 6313 passed; 45 explicit skips after Desktop rerun | `js-tests.log`, `outbox-rerun.log`, `desktop-tests-rerun.log` |
| Host full suite | 747 passed; zero failed/ignored | `host-tests.log` |
| Rust fmt / clippy | Passed with existing warnings | `fmt.log`, `clippy.log` |
| Documentation structure/locales | 561 pages and 85 specification pairs passed | `docs-check.log` |
| Seven Workflow/shortcut E2E suites using the installed release Host | All passed | `shipped-host-{coding,runs,discovery,recovery,stages,reopen,artifacts}.log` |
| NSIS build / isolated installation | Passed; installer exit 0 | `nsis-retry.log`; installed executable and Host inspected |
| Installed boot/preload/IPC and session-list responsiveness | Passed | `installed-boot-final.log` |
| Installed shortcuts, More menu and Workflow UI | Passed | `installed-workflow-accepted.log`, `installed-ui.png` |
| Synthetic old-data migration / integrity | Passed | `legacy-seed.log`, `legacy-verify.log`, retained `pi.sqlite.v20.bak` |
| Package inventory | Payload checks passed against current config; stable-size comparison remains unqualified | `package-inventory.json` |

The original recursive JS run had one Windows `EPERM` rename failure in
`persistence-outbox.test.mjs`. That file passed 10/10 in isolation; the complete
Desktop suite then passed 3295 tests with 42 explicit skips at concurrency 4.
Other packages passed 3018 tests with three explicit skips. The failed command
is retained as evidence and is not itself reported as green.

## Installed user paths and data safety

Before installation, no PI-Desktop uninstall registration existed. NSIS ran
silently with an explicit worktree-local `/D` destination. It installed its own
Host and resources. Boot launched the installed executable from a different
working directory with an isolated Chromium profile, application data,
agents directory and update cache; no development Host override was supplied.
The boot probe verified version, protocol v11, sandbox preload/IPC, Ctrl+R
protection and eight refreshes of 800 sessions. Maximum list time was 91.6 ms;
maximum Main heartbeat gap was 47.6 ms.

A synthetic database was created through public Host RPC, then downgraded to
the v20 structure using the repository's existing migration-fixture approach:
remove `session_todo` and the two session todo stamps, and set `user_version`
to 20. Installed startup migrated it to v21 and retained its conversation,
artifact index, unrelated Chinese kv value and project file. SQLite integrity
was `ok`, and a pre-migration backup exists. This is a populated schema fixture,
not a copy of private user data or proof of every historical app version.

The real packaged renderer operated all eight primary shortcuts, Ask and all
17 More-menu entries being available; selecting a More entry inserted its
marker. Draft text remained present. No prompt was submitted to a real model.
The installed application selected the retained conversation, created a
Workflow Run, displayed Discovery ready and five locked stages, archived the
run and retained its history after a separate application restart. Chinese
labels and the final screenshot were visually inspected.

The seven source-renderer fixtures use real Main/Host/Agent Runtime wiring with
deterministic external provider boundaries and the installed release Host.
They cover manual submission and actual Skill loading, draft/file retention,
missing/disabled catalog recovery, stale results, busy queues, keyboard/narrow
layout, creation/archive, Discovery, Stop/Retry/Continue, interruption without
replay, six-stage explicit acceptance, reopening and artifact path safety.
These fixture results are distinct from operating the packaged renderer.

## Corrections and limitations

Package inventory records 397,454,593 bytes unpacked, 25,865,271 bytes ASAR,
328,764,778 bytes Electron/runtime (excluding resources and locales), 5,853,498
bytes locale packs and 8,923,755 bytes unpacked native modules. There is one
sidecar and one native Host, no raw renderer packages, no dependency maps/tests/
examples/declarations, 19 ASAR license/notice entries and the Matt skills
license in resources. This presence check is not a full legal license audit.
The nine locale packs match current builder configuration; release-runbook
prose omits its configured Portuguese `pt-BR` pack (documentation drift).
No previous Windows stable payload is available locally for the mandatory
15-percent footprint comparison. The formal publication gate remains partial;
only NSIS was produced, not the other compressed Windows formats.

- Initial shortcut E2E failed because current button copy is `Initialize` /
  `初始化`, while the fixture still selected the previous labels. Only fixture
  copy was corrected; product copy and behavior were preserved.
- Initial packaging was interrupted; an NSIS tool download subsequently timed
  out through direct GitHub access. The completed NSIS pass reused unpacked
  production output and downloaded small build tools through the available
  local proxy into the worktree cache. Electron 43.6.0 was reused locally;
  its existing large archive was checked in the cross-project download cache.
- Initial installed probes used an incompatible boot-profile location or
  selected the hidden plugin launcher. Corrected probes satisfy the existing
  temporary-profile guard and select the actual main renderer. A premature
  archive observation was replaced by checking durable public history; final
  acceptance independently read the retained archived run after restart.
- Automatic updater activity in the first isolated UI attempt logged a checksum
  mismatch while checking the upstream release feed. The synthetic profile was
  subsequently set to manual updates through public Host RPC. Update download,
  feed alignment and apply/rollback are not qualified by this acceptance.
- ZIP/portable packages, signing/SmartScreen reputation, clean Windows VM,
  Windows ARM64, macOS/Linux and real/paid providers were not exercised.
- `verify:ui:*` was not run. The request used isolated installed-app probes and
  relevant fixture E2E, rather than attaching to a user-owned Desktop.
- The initial acceptance did not release, tag, push or commit. Test/process cleanup and final
  review are recorded below; the installer and synthetic evidence remain local.

## Reproduce

Use the existing README prerequisites and reuse a compatible host environment.
Build with `pnpm --filter @pi-desktop/desktop run dist:win`; when reusing linked
dependencies, `--config.verifyDepsBeforeRun=false` avoids a second install.
Release docs use `node scripts/check-release-docs.mjs 0.16.0`. Workflow acceptance
uses `node scripts/e2e-workflow-runs.mjs` and its `--coding`, `--discovery`,
`--recovery`, `--stages`, `--reopen` and `--artifacts` selectors; set
`PI_DESKTOP_HOST_BIN` to the installed release Host for shipped-binary coverage.
Local acceptance helpers and raw logs are retained under the ignored evidence
directory. Reinstallation must use a fresh isolated destination/profile.

## Final review and cleanup

Independent Standards and Spec reviews checked the task diff and raw final
evidence. Code findings were zero. Standards requested explicit cleanup/review
evidence; Spec requested package-inventory evidence. Both were added above;
previous-stable comparison and formal release qualification remain limitations.
The changes preserve product behavior and public contracts, so no product-spec
or ADR change is required.

The temporary installation was uninstalled (exit 0); a subsequent readback
confirmed its application executable and uninstall registration were gone.
No task-owned Desktop/Host process remained, and sampled CDP listening ports
were released. The pre-existing Host PID 28112 was preserved. Installer,
unpacked application, screenshots, logs, migration backup and synthetic profile
remain local under the ignored evidence/build directories. Toolchain-generated
lockfile changes were removed after checking the exact task-only diff; no
dependency change is part of delivery. `git diff --check` passed.

## Subsequent delivery authorization

After reviewing this acceptance, the user authorized commit, push and release.
The delivery target is this fork, not upstream `vastsa/PI-Desktop`. The fork
had no existing releases or matching `v0.16` tag when checked. Its workflow
directory contains upstream synchronization only, so the verified local NSIS
artifact will be attached to a Windows-only `v0.16.0-beta.1` prerelease without
claiming stable or cross-platform release qualification. This inventory is the
fork's first audited Windows package baseline; there is no previous fork stable
release to compare. Future Windows publication must compare against it.

The release tag must resolve to the merged acceptance commit, whose product
inputs are unchanged from the tested build candidate. The release notes must
identify that original build commit, the artifact checksum, unsigned status,
test scope and incomplete update-chain qualification. No updater feed is
published because the installed application's feed still targets upstream.
