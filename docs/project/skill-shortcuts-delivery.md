# Skill Shortcut Delivery

Date: 2026-10-03
Status: Implemented and validated; release pending. Delivery and current merge status: [PR #16](https://github.com/yuqiangdede/mattpocock-PI/pull/16).
Branch: `docs/skill-shortcuts-design`.
Base main: `bd0ab10e86cb5ae0daddaff2fcc5743edcbc8424`.

## User operation / release note

Use the eight engineering buttons above the home/conversation Composer.
A click adds a skill and its localized default instruction to the existing draft;
edit the request and manually Send. Ask next step inspects current project
evidence before recommending a concrete action. Every More skill also has an
editable instruction. Existing text and attachments remain intact.
Engineering initialization uses `/setup-matt-pocock-skills` to configure the
issue tracker, engineering documentation and skill conventions. Results and
Stop appear in ordinary chat. Missing skills expose Configure skills.
Full Engineering Workflow remains available in the Work Panel.

## Change and compatibility

The old task intake panel, result cards, polling and automatic waiting-task
launch are removed. No new Free Task record is created by shortcuts. Retain
Host APIs/data, saved legacy drafts, historical task outcomes, project files
and initialization backups. Host startup recovery remains authoritative;
ordinary Composer draft caching does not become disk persistence.

The change reuses the supported Node/pnpm/Electron/Rust toolchain and existing
project dependencies by reference. Stale links and the old Host binary were
replaced/rebuilt against this checkout. No dependency or runtime installation
was performed. Existing startup is `pnpm dev`; build is `pnpm build:js`.
Fixture command is `node scripts/e2e-workflow-runs.mjs --coding`, with isolated
project state. Linked validation uses `--config.verifyDepsBeforeRun=false`.
No machine-specific paths were added to application configuration or code.

## Exact candidate and review

The three Electron suites ran on
`ad20b48179c9e60ddb6405b778d0f76ead18f32e`, containing the current base main.
Formatting only the private commit message produced
`5623126e57313c895b4e174117af86f5e4433eb4`. Both commits have the exact tree
`2d1c84908c6bde48891838aa5bee1e714054eb37`; no executable content changed.
The subsequent documentation-only commit records these results.

Standards and Spec were independently reviewed against `bd0ab10`; both have
zero confirmed findings. The implementation round left main unchanged. The
user subsequently authorized delivery to main through PR #16. Integration
candidate results are retained with the validation evidence.

## Validation results

Evidence is retained in ignored `cache/skill-shortcuts/` in this worktree.
Initial red: real Composer has no Implement shortcut. First green: inserting
Implement does not submit. Acceptance then covers all eight mappings, actual
setup/implement Skill bodies, equivalence to a typed slash prompt, retained
text/files through Composer remount, missing/disabled/catalog-error recovery,
stale-session isolation, edits during catalog lookup, busy queueing, a 460px
outer window, native Space keyboard activation and Chinese labels.

| Gate | Result | Evidence |
| --- | --- | --- |
| JS build | Passed | `build.log` |
| Desktop typecheck / lint | Passed | `typecheck.log`, `lint.log` |
| Docs checks / UTF-8 / diff checks | Passed; 560 docs pages checked | `docs.log` |
| Rust fmt / clippy | Passed; pre-existing warnings retained | `fmt.log`, `clippy.log` |
| Host tests | 747 passed, 0 failed/skipped | `host-tests.log` |
| Non-Desktop JS packages | 3018 passed, 3 explicit skips | `js-tests.log` |
| Desktop full suite | 3293 passed, 0 failed, 42 explicit skips | `desktop-tests-correct-cwd.log` |
| Shortcut candidate E2E | Passed | `coding-candidate.log` |
| Strict Workflow stages E2E | Passed | `stages-candidate.log` |
| Workflow interruption/recovery E2E | Passed | `recovery-candidate.log` |
| Current main ancestry | Passed | `base.log` |

The initial recursive JS command reported two environmental failures:
Windows EPERM during npm fixture-directory cleanup and a 20ms MCP connection
deadline. Both affected files passed separately (39 passed, 3 skips).
An intermediate Desktop rerun from the repository root could not load three
cwd-relative test modules; correcting the package cwd and using concurrency 4
with project-local temporary state produced the full green Desktop result.
Across packages, JS coverage is 6311 passed and 45 explicit skips. The failed
commands are retained as diagnostic evidence, not counted as passes.

Existing public Host tests cover interrupted legacy waiting/pending records,
retained history and initialization backup/file safety. A new assertion proves
ordinary chat can begin after restarting a waiting legacy record. The retained
strict suites prove explicit acceptance and cancellation remain unchanged.

## Limits and process cleanup

Real paid providers, installers and macOS/Linux were not exercised.
`verify:ui:*` was not requested and was not run. Test fixture processes were
disposed and no task-owned workflow Electron/Host process remained. Unit-test
HTTP fixtures use their existing cleanup paths. User-owned services were not
used or stopped. This worktree remains attached for review and later delivery.

## Default-instruction follow-up (2026-10-03)

Branch: `codex/coding-shortcut-layout`; tested uncommitted working tree based on
`c2cee028616b5e8079e8d537db0002a65b5b0826` (also origin/main at preparation).
Adds two shortcut rows, priority text weights and 26 localized skill instructions.
Eight targeted Node tests, Desktop typecheck, electron-vite build, Biome's
configured lint surface, style-token and diff checks passed.
`node scripts/e2e-workflow-runs.mjs --coding` passed all reported fields,
including real manual Send/Skill loading, retained drafts/attachments, catalog
recovery, stale-session isolation, queueing, narrow layout, keyboard and locale.
Validation reused host dependencies, Electron, Host and Agent Runtime artifacts.
The expanded coding fixture has a 120-second total deadline. Missing optional
skills preserve the draft and show configuration guidance; the bundled pack
does not include resolving-merge-conflicts. No live provider was contacted.

## Global settings and update detection follow-up (2026-10-03)

The user approved the design in engineering-shortcut-settings-design.md and
requested implementation. Settings > Agent > Skills now edits all 26 global
instructions, including empty overrides and per-item localized restoration.
The two update modes use manual installation; automatic detection defaults to
one attempt per 24 hours and retains attempt time across failures/restarts.
Main-owned check metadata is excluded from ordinary renderer settings writes.

Task candidate: uncommitted work on `codex/coding-shortcut-layout`.
Base main: `c2cee028616b5e8079e8d537db0002a65b5b0826`; refreshed origin/main
remains the same revision. No task commit or push was authorized.

Validation: 23 targeted Node tests, four changelog tests, 749 Host tests,
current Host preference validation tests, Shared/i18n builds, Desktop
typecheck against current workspace sources, production Electron build,
configured Biome lint, style-token checks, Rust fmt/clippy and diff checks.
Clippy retains only the pre-existing guard/created_at warnings.

Both `--coding` and `--engineering-settings` Electron fixtures passed.
Settings acceptance includes save/remount/read/use, retaining the existing
draft, empty override, restore, manual mode, check without install, explicit
update, preserving locally edited/disabled skills, and offline recovery.
Scheduler tests use a controlled clock and cover stale Host results, disposal,
coalescing and manual detection concurrent with a skipped automatic tick.

Logs/artifacts: ignored `cache/engineering-settings/`. The environment reuses
existing dependencies, Electron, Cargo targets and Agent Runtime. Desktop
typechecking uses a scratch tsconfig pointing at current Shared/i18n sources
so old linked declarations do not mask contract changes. No dependencies were
installed. The current shipped 37-package snapshot matches public upstream
`d81f3a183412e71a5b1e84ca21bc1a35eea03a60`, rechecked during delivery.

Real GitHub detection was checked read-only; installation behavior was
validated through an isolated GitHub-source fixture. No real user skill
installation, paid provider, installer/signing or cross-platform packaging
was exercised in this request. Temporary Electron/Host processes exit and
the fixture removes its profile/project directories.

The user subsequently authorized commit, push and merge into remote main.
Delivery refreshes the request against the newer version-source commit before
validating the committed task and PR integration candidates.
