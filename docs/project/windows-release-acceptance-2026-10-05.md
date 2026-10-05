# Windows 0.16.0-beta.2 Release Acceptance

Date: 2026-10-05. Scope: unsigned Windows x64 preview, based on remote main
`87fcb5a3652dea54f4dd78e025d185766f69785a`. The release tag identifies the final
source revision; no existing release asset is replaced.

## Artifacts

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `PI-Desktop-Setup-0.16.0-beta.2.exe` | 111,502,841 | `b07dc78c9dfa9384e90dab96d84da99e9708fa890b9a80c498d3b10e9dc5e28d` |
| `PI-Desktop-Portable-0.16.0-beta.2.zip` | 155,116,790 | `02f1bd952d7de9509d5917cb4db84ae8fe81ef9ff10d22fff7adabe1f783dd9d` |
| `PI-Desktop-Portable-0.16.0-beta.2.exe` | 99,992,551 | `e5076eef9a23b73c7cf2412a32724df390a874ec3e50778e59af928ca4fdd3db` |

The NSIS installer is 0.19% smaller than the published beta.1 installer.
The ZIP and Portable executable establish baselines for their formats. No
previous stable Windows asset is available for a stable-version comparison.

## Build and verification

- Windows x64; Node 24.15.0; Electron 43.6.0. Compatible host dependencies,
  Electron and the Cargo target cache were reused. No second dependency
  installation was performed. Native dependencies were rebuilt by
  electron-builder. The existing local Electron distribution was used, so no
  large Electron download was required.
- All workspace/Cargo/app version surfaces are `0.16.0-beta.2`; in-app release
  notes remain under the stable preview version `0.16.0` in every shipped locale.
- Shared release-note tests: 4 passed. Release/shortcut regression tests: 14
  passed. Release-blocker regression tests: 37 passed.
- Desktop full suite: 3319 passed, 42 explicit skips, zero failures. Host full
  suite: 750 passed, zero failed/ignored.
- Desktop/i18n typecheck, dependency compilation, release Host compilation,
  sidecar bundle, production Electron build, style tokens, Biome (108 files),
  policy sync, release docs and diff checks passed.
- electron-builder produced NSIS, ZIP and Portable artifacts with the correct
  per-format distribution metadata. All three archives passed integrity checks.
- Installed-format and ZIP packaged executables started from unrelated working
  directories using isolated profiles. Sandbox preload/IPC, app/Host version,
  protocol v11, Ctrl+R handling and eight refreshes of 800 synthetic sessions
  passed. Final maximum list times were 111.3 ms and 112 ms; maximum Main gaps
  were 34.9 ms and 38.3 ms.
- The actual Portable launcher was tested, with project-local extraction,
  profile and data directories. Its packaged Host reports the same version.
  The first row has the five expected Chinese actions; More has four named
  groups and 19 entries. Quit in the existing automated-capture mode released
  the debugger port. Normal interactive quit confirmation is not bypassed in
  the shipped application.
- Packaged engineering-skills acceptance passed: 37 bundled skills and their
  resources load, six native defaults render, real Workflow/Skill calls use a
  local provider fixture, and disabled skills/local edits survive restart.
- Package inventory: one Host and one sidecar, required skill license retained,
  no raw renderer dependencies or dependency tests/maps/declarations in ASAR.
  Installer-format ASAR is 25,158,906 bytes; unpacked package is 396,720,437 bytes.

The original Desktop run had four failures. Two SSH fixture URLs still pinned
upstream instead of the fork release repository; settings validation asserted
object identity instead of preserved values after engineering normalization;
and Feedback help was hardcoded in Chinese. Fixtures now assert the current
contract, with frozen settings inputs, and Feedback again uses the existing
localized description. The entire suite was rerun successfully before delivery.

## Commands and evidence

Normal project setup/build commands remain in README. Windows packaging is
`pnpm --filter @pi-desktop/desktop dist:win`. This host's pnpm 12 task-state
restriction on linked dependency directories required invoking the same
TypeScript, bundler and electron-builder entry points directly; the production
configuration and distribution metadata are unchanged.

Artifacts: `apps/desktop/release/`. Logs, archive checks, local acceptance probes,
manifest and inventory: `cache/release-acceptance/`. User startup requires no
Node/Rust installation: run the Setup installer, extract the ZIP and start
`PI-Desktop.exe`, or run the Portable executable. Existing documented
`PI_DESKTOP_DATA_DIR` behavior remains unchanged.

## Qualification limits

This is an unsigned Windows preview. Authenticode signing, clean-VM acceptance,
NSIS user-install/upgrade and automatic updater delivery are unqualified; the
packaged installed-format executable was tested without replacing any existing
user installation. macOS/Linux/remote pi-host artifacts are not part of this
release. No real provider, paid API or user data was used. Temporary test
processes were stopped; existing user services and primary-checkout edits were
preserved.
