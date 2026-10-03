# Skill Shortcut Delivery

Date: 2026-10-03
Status: Implementation candidate; final review and validation in progress. Not published or merged.
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

The change reuses the current supported Node/pnpm/Electron/Rust toolchain and
project dependencies. No dependency or runtime installation was performed.
Existing startup is `pnpm dev`; build is `pnpm build:js`. Test fixture command
is `node scripts/e2e-workflow-runs.mjs --coding`, with isolated project state.
No machine-specific paths are added to application configuration or code.

## Validation

Evidence is held in ignored `cache/skill-shortcuts/` in the request worktree.
Initial red: real Composer has no Implement shortcut. First green: inserting
Implement does not submit. Further checks cover all mappings, text/files and
real manual submission with the normal Skill tool and model fixture.
Shortcut fixture acceptance passed: all mappings, manual slash equivalence, actual setup skill loading, retained text/file references through Composer remount, catalog remediation, stale-response isolation, edits during catalog lookup, ordinary busy queueing, 460px outer window, native keyboard activation and Chinese labels.

Build, Desktop typecheck, lint, docs check and Rust fmt passed. Host: 747 passed, zero failures. Initial recursive JS run had two unrelated environmental failures (temporary-directory EPERM in npm-executable cleanup and the 20ms MCP handshake deadline). Both affected files passed separately: 39 passed, 3 explicit skips. Final Desktop suite is rerun with bounded concurrency and project-local temporary state.

Real paid providers, installers and macOS/Linux have not been exercised.
`verify:ui:*` was not requested and is not run. Fixture processes are disposed
at the end of each suite; user-owned services remain outside the test setup.
