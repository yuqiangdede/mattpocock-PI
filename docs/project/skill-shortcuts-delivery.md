# Skill Shortcut Delivery

Date: 2026-10-03
Status: Implemented and validated; release pending. Delivery and current merge status: [PR #16](https://github.com/yuqiangdede/mattpocock-PI/pull/16).
Branch: `docs/skill-shortcuts-design`.
Base main: `bd0ab10e86cb5ae0daddaff2fcc5743edcbc8424`.

## User operation / release note

Use the eight engineering buttons above the home/conversation Composer.
A click adds a skill to the existing draft; edit the request and manually Send.
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
