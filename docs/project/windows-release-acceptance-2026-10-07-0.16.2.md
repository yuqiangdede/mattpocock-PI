# Windows 0.16.2 release acceptance

Date: 2026-10-07. Base main: `119e15669fcecb93c390a1489719ca456990b525`.
Scope: stage-one independent Skill Launcher and Windows x64 stable channel.

## Requirement audit

Issues #31–#37 are closed. Current `skill-launcher-spec.md` is authoritative: selection prepares an editable draft, and only manual Send invokes native Pi execution. The current candidate preserves Registry sorting/enabled behavior, CRUD, restart persistence, legacy migration, JSON portability, corrupt-file backup/recovery, native Skill source resolution and latest Skill loading. No Development Navigator, forced stages, automatic advancement or replacement Runtime is introduced.

The audit found stale user documentation advertising withdrawn Workflow entry points and one outdated Desktop test requiring the Workflow panel to mount. Release documentation and its Chinese specification mirror now describe current availability. The test retains historical control coverage while asserting that the panel is not mounted. No application execution logic changed in this release preparation.

## Executed gates

| Gate | Result |
| --- | --- |
| Workspace production build / docs build | Passed |
| Desktop TypeScript, lint/style tokens, agent policy, diff check | Passed |
| Release versions / nine locale changelog catalogs | Aligned at 0.16.2 |
| Desktop full suite | 3495 passed, 46 skipped, zero failed/cancelled |
| Host full suite | 787 passed |
| Shared / i18n / Agent Runtime | 1174 / 29 / 1238 passed |
| Rust fmt / clippy | Passed with pre-existing warnings |
| Coding Actions Electron/Host/Pi E2E | Migration, CRUD, order, enabled, native execution, latest Skill, missing Skill, corruption recovery, ordinary Chat, persistence and native settings preservation passed |
| Engineering settings E2E | Manual detection, update, preserved local changes and offline behavior passed |
| Boot responsiveness | 800 sessions, protocol 11; unpacked and extracted installer/ZIP payloads passed |
| Distribution inventory | Installed, ZIP and Portable: version 0.16.2, one Host, one sidecar, zero forbidden dependency payloads |
| Archive integrity | Installer, ZIP and Portable passed |
| Packaged ZIP and Portable payload user path | Save/restart, editable draft/manual Send, native/latest Skill, import/export, missing Skill, corruption backup/recovery and ordinary Chat passed |

The initial Desktop run preceded dependency output completion and had missing-module failures plus the stale Workflow assertion. Its log is retained; the completed full rerun above is the acceptance result. Packaging reused the existing Electron 43.6.0 runtime and Cargo target; an initial installer missing the Host was rebuilt after linking the local packaging target. Only the rebuilt verified artifact is eligible for publication.

Evidence and reproducible qualification helpers are isolated under `cache/release-0.16.2/`; downloadable artifacts are under `apps/desktop/release/{installed,zip,portable}/`. `SHA256SUMS.txt` covers all five payload/update files. Packaging requires the compatible project toolchain described in the root README; `pnpm --filter @pi-desktop/desktop dist:win` is the standard build entry.

## Limits

Unsigned (`NotSigned`) Windows x64. This release does not qualify real NSIS install/upgrade/uninstall on a clean VM, real updater installation, Authenticode, external paid models, macOS/Linux or remote pi-host. Installer payload extraction and isolated boot are not a substitute for a real installation test. No existing user application data or services were used as test fixtures.

Actual Portable launcher without additional command-line arguments started version 0.16.2 with protocol 11 and shut down successfully (exit 0), verified by its isolated lifecycle log. Passing automated Chromium/user-profile command-line arguments to the self-extracting launcher returned exit 2; the full interactive regression therefore ran against its identical unpacked payload. This CLI-automation limitation is not reported as a passing launcher interaction test.

Final compressed sizes: installer 120092394 bytes, ZIP 175147312 bytes, Portable EXE 107404348 bytes; each is slightly smaller than the corresponding published beta.2 asset (120110108 / 175153334 / 107412840 bytes). No previous stable Windows artifact is available as a stable footprint baseline.