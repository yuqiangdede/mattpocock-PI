# Coding Workbench Task Candidate

Date: 2026-10-03. Scope: [issue #14](https://github.com/yuqiangdede/mattpocock-PI/issues/14).
Status: Local implementation and verification; no remote delivery or release.
Base main: `00fae4b9116653a5aacce5232d0981d8127f8af0`.
Candidate identity is recorded in the request worktree's ignored validation
artifacts when final task-candidate checks run. Results qualify that executable
candidate, not an untested remote merge or a packaged release.

## Behavior and ownership

The home surface exposes eight engineering actions in free order. Task intake
retains drafts and previews optional context; direct implementation requires
neither a ticket nor a specification. Conversations retain Coding Tools and
Back to Workbench. Results are attributed to their originating task and turn,
with Markdown artifacts, verification notes and optional follow-up actions.

Host owns versioned Free Task records, waiting, admission, terminal outcomes,
recovery and native initialization previews. Ordinary Agent IPC and the actual
Skill tool execute engineering skills; formal Workflow Runs retain their
existing acceptance rules. No SQLite ownership moves into Renderer. A same-root
concurrent task is refused before writes; users may choose a separate worktree.

Initialization supports a new named directory or an existing project. Users
inspect and select Add/Modify/Keep files. Existing files default to Keep.
No-overwrite publication retains displaced originals; partial retry restores
the original selected items, skips completed work and preserves later edits.

## Verification and acceptance mapping

| Surface | Executed evidence |
| --- | --- |
| Main user path | `node scripts/e2e-workflow-runs.mjs --coding`: direct implementation, actual Skill loading, result card, explicit handoff and reference removal. |
| All actions / context | The same fixture executes the seven installed skills out of suggested order, native initialization, new-conversation isolation and model/disabled-skill remediation with retained drafts. |
| Lifecycle | The fixture covers durable waiting, release, cancellation refusal followed by normal completion, acknowledged Stop and no false terminal settlement. Host tests cover withdrawable waiting, interrupted restart, identity conflicts, unrelated data and preserved future documents. |
| File safety | Host and fixture tests cover default Keep, stale preview rejection, original retention, later open-handle edits, partial failure/retry and creating only a new named directory. |
| Accessibility | The fixture operates a 460px-wide window without horizontal overflow, asserts one card column, description focus and Tab trapping. |
| Compatibility | Full Host tests retain strict Workflow transitions and persistence behavior. Targeted lifecycle tests retain normal session terminal semantics. |
| JavaScript suite | Recursive tests: 6311 passed, zero failed, 45 explicit platform/provider skips. |
| Rust suite | `cargo test -p host-core --locked --offline`: 747 passed, zero failed or skipped. |
| Static/build | JavaScript build, Desktop typecheck, lint, Rust format, Clippy, documentation pairing and diff checks passed. Existing Rust warning-only diagnostics remain. |

The request reuses installed host Node/pnpm dependencies through task-owned
directory links. It does not install a second runtime or embed development
machine paths into application configuration. Mutable fixture profiles,
directories and artifacts remain within the request worktree. Fixtures dispose
their own Electron and Host processes; no user-owned service is targeted.

## Limits and operational guidance

- Initialization prepares conventions, skill guidance and startup/verification
  scripts. It does not install dependencies or silently install/enable skills.
  Unknown stacks and Python entry points require the user to fill the generated
  startup command; the result explicitly reports that scripts were not executed.
- Existing project startup remains `pnpm dev`; the repository's initialization,
  dependency and platform requirements remain in its README. Verification entry
  for this feature is the Coding Workbench fixture command above.
- Non-English/Chinese locales use English fallback for the new strings.
- Real providers, paid APIs, packaged installers and macOS/Linux behavior were
  not used as acceptance environments. `verify:ui:*` was not run because the
  user did not request it.
- This is a local task candidate. Push, PR integration validation, merge and
  release remain separate delivery work; the issue remains open.
