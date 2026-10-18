# PI-Desktop 0.21.0-beta.3 integration

## Source and scope

- Fork base: `bbe01472e` (current `origin/main` before editing).
- Previous upstream: `v0.20.1`, `cb88131b34680afd45d931a37d4bd0a7893f29ed`.
- Explicitly selected prerelease: `v0.21.0-beta.3`,
  `5e1655893ce6181b3e9324b0f49b52f1c7f79762`.
- Application/workspace/Cargo versions: `0.21.0-beta.3`.
- Release: <https://github.com/vastsa/PI-Desktop/releases/tag/v0.21.0-beta.3>.

The fixed-baseline three-way preview contained 413 files and 39 conflict
records. Adopt schema 24, optional isolated session worktrees, background
shell tasks, reading-position recovery, HTML preview APIs, plugin reviews,
storage migration fixes, Windows shell handling and upstream security patches.
The upgrade entry point now accepts explicitly selected prerelease tags with
SemVer ordering and preserves its clean-worktree, main-branch, exact-tag and
downgrade fences.

## Fork boundaries

Preserve fork branding, manual application updates, Matt/document Skills,
Coding Actions and interview flows, Workflow/Free Task contracts and release
history. Do not resurrect intentionally removed upstream CI or split English/
Chinese changelog catalogs. Combine new worktree strings with existing
engineering translations. Keep the Windows offscreen transcript probe and
portable Host executable resolution in isolated acceptance fixtures.

The upstream worktree-aware scheduler replaces the earlier semaphore scheduler
as one coherent implementation with its tests. Session/turn ownership remains
in the existing Host. The native worktree capability is opt-in; no fork
workflow becomes a second session owner. ADR 0329 records upstream's design.

Keep the fork's existing invalid UTF-8 omission behavior while adopting the
upstream physical-line reader and invalid-record diagnostics. Reads preserve
the underlying transcript bytes and count original byte offsets.

## Qualification

Logs are retained in the request-local `cache/upstream/`. Dependencies were
absent here and upstream security overrides/Pi patches changed. The frozen
offline install reused cached packages but lacked an updated tarball; the
subsequent frozen install reused the host pnpm store. Electron uses the primary
checkout's existing binary by reference; Cargo reuses the provisioned target
cache. Test profiles remain request-local.

This source PR does not replace the original ZIP, publish installers, certify
signing/updater installation, use paid models or migrate an installed profile.
Database migration is forward-only: a schema 23 application cannot reopen
schema 24; retain the v23 backup for a deliberate rollback.

### Verified gates

- Full workspace JavaScript/documentation build and package typechecks passed.
  Desktop was rebuilt after final branding adaptation; its typecheck passed.
- Release documentation/version, agent-policy synchronization, Pi dependency
  and patch checks, documentation locale/link checks, Rust formatting and
  clippy passed. Clippy retains upstream warnings.
- Upgrade/release/version-source safety tests: 18 passed. The two prerelease
  upgrade tests failed on the original stable-only script before the fix.
- Shared 1,278; Plugin SDK 382; Plugin DevKit 52; i18n 30; Agent Host 65;
  Voice Runtime 51; RACP 27; Host Runtime 119 passed (three platform skips).
- Agent Runtime: 1,410 passed, one existing skip, one bundle-worker timeout
  in the concurrent sweep. That remaining real bundle/Photon WASM test passed
  in a single-worker recheck in two seconds, without changing its deadline.
- Desktop sweep: 4,131 passed, eight failed, 71 explicit skips. All eight
  failing files were rechecked after fixture/branding adaptation: 58 passed,
  zero failed, four platform skips. The npm unsafe-lockfile test's initial
  Windows cleanup EPERM did not recur in two subsequent runs.
- Host final full regression: 1,018 passed, zero failed, one existing ignore.
  Isolated worktree/RPC user paths passed all 77 targeted tests as well.

The test repositories pin `core.autocrlf=false`; non-repository fixtures block
accidental upward discovery from request-local scratch. Production Git
environment sanitization stays intact. The original failed probes' two
request-local worktrees were verified clean at the base revision and removed.
No other checkout or branch was cleaned.

### Real-process acceptance

- Extract only the Host from the exact reported local
  `mattpocock-PI-Portable-0.20.1.zip` into request-local cache. Its SHA256 is
  `92cf64e15507cba28a9b7616fe829c9392aeb544ed992d915ed56fb4ed79ca1a`.
  Seed synthetic v23 data, upgrade through the new Host with a v23 backup,
  reproduce the old Host's exact `schema version 24 ... supported 23` refusal,
  and reopen successfully with the new Host. Chinese/emoji messages and
  transcript bytes survive. No installed database is opened.
- Electron cold boot passed at app `0.21.0-beta.3`, protocol 11; all eight
  reads returned 800 synthetic sessions with consistent capabilities.
- Coding Actions' complete Electron journey passed migration, custom CRUD,
  order/enabled state, native Skill execution, latest content, missing Skill,
  corrupt-file preservation, ordinary chat and restart persistence. Existing
  editable drafts, manual Send, compile restrictions, fixed review label and
  semantic-title policy are preserved. The fixture now wires upstream's
  `recordTurnStart` and background-task listing through the real owners.
- Storage bootstrap passed migration progress, Chromium/plugin state,
  cache/backup cleanup and missing-directory recovery variants.

Windows-incompatible POSIX fixtures are explicit skips. Live-model worktree
E2E, native macOS/Linux, signed installers, updater installation and the user's
actual selected profile remain outside this source PR's qualification.

### Committed task candidate

- Integration source: `d365d78cdc2e698b876b7f7aacc1ffacede9155b`.
- Acceptance candidate: `2ce1732e6acc4e9b199b7be9ae872cde02515a7c`.
- Base main: `bbe01472ef40e1e586951fe95ef459a0880bc8ee`.
- Candidate Host SHA256:
  `782f4a58580c4c181ef91a40ffd265700464673214e911560754b06c98b5d307`.
- All six committed-candidate probes passed: original ZIP comparison,
  standalone v23 fixture, Electron cold boot, Coding Actions, storage bootstrap
  and UTF-8 review follow-up/restart. No test process remains running.
- The standalone fixture reconstructs the historical projects table only in
  its throwaway profile, avoiding a Node SQLite DROP COLUMN/comment parser
  incompatibility. The original packaged-Host path uses its real v23 schema.
- The final evidence commit changes this report only; executable source and
  acceptance scripts remain identical to the validated candidate.
