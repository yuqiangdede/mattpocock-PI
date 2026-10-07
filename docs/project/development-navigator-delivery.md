# Development Navigator implementation candidate

Date: 2026-10-08
Status: Implemented and locally validated; PR #53, not merged or released.
Specification: [first-release contract](../spec/01-product/development-navigator.md).
Tickets: [#47–#52 and dependencies](development-navigator-tickets.md).

## Delivered behavior

- Optional conversation-scoped Navigator with latest-activity default selection,
  one detail pane, and inspectable native request outcomes and Skill-use evidence.
- Explicit multi-round continuation, leaving, ending, and renewed discussion.
  Reply termination never completes an activity or approves engineering content.
- Reply/file/validation references with provenance and uncertainty; corrections
  and hide/restore retain source messages and files.
- Manual analysis-only ask-matt recommendations using the installed method,
  current model, selected authorized evidence, no model tools, and Host admission.
  Cancellation, timeout, stale results, deletion, and restart have guarded paths.
- Suggested follow-ups prepare editable historical context through the existing
  Launcher/Composer seam, preserving live text, file references, and images.
  Explicit Send remains required; generated slash text stays literal context.

## Files and ownership

Renderer modules under `apps/desktop/src/features/navigator` own presentation and
draft handoff. Main analysis orchestration and IPC live in dedicated services;
native Skill document resolution is shared with existing execution. Rust Navigator
modules own schema v22, activity/analysis state, evidence associations and admission.
Shared modules define validated boundary inputs and suggestion metadata.
Pi Agent Runtime core is unchanged.

## Verification evidence

Executable candidate: `6ff895727400132aa92fe2bdb99cc3e54b2a42ff`.
Base main: `ad0c0a6621b0d3d34a0346d17c944e96686aa077`.
Candidate tree: `54b8bc6413d4d2edd866f38888a9ec0642195f5e`.

| Gate actually executed | Result |
| --- | --- |
| Desktop full suite | 3525 passed, 46 skipped, zero failures |
| Host full suite | 801 passed, zero failures |
| Shared full suite | 587 passed |
| i18n full suite | 29 passed |
| Desktop source-alias typecheck | Passed |
| Shared/i18n builds and Desktop production build | Passed |
| Rust fmt and all-target Clippy | Passed; existing warnings retained |
| Agent policy, style tokens, whitespace | Passed |
| Documentation | 89 English/Chinese pairs and 605 pages passed before this delivery page |
| Independent Standards and Spec review | Five P2 findings fixed; both rechecks have zero remaining blockers |

Extended real Electron/Host/Pi tests ran on committed fix
`d15eaeaf698f1532b1282c51606db1225acea84a`, whose complete Git tree is identical
to the executable candidate. They cover multi-round work, explicit boundaries,
real source previews, controlled late-success/error races, selection, ordinary
chat staleness, selected-only tool-free analysis, draft text/file/image retention,
manual Send, hide/restore, restart, and no automatic replay. Model streams are
external fixtures; internal component/IPC/Host wiring remains real. The two
reproducible defects in file handoff and preview ordering were run red on baseline
code and green after correction.

The earlier full Desktop attempt had seven missing-build-output failures.
Building this worktree's changed Shared/i18n packages resolved them; the full
suite above was then rerun. Windows full-file argument expansion exceeded the
command-line limit, so the existing Node test glob was used. Shared Cargo outputs
proved unsafe across simultaneous worktrees; final Host validation used isolated
mutable candidate build outputs and existing registry/toolchain resources.

## Environment and reproducible entry points

Requirements and initialization follow the project README and lockfile: Node
22.19 or newer, the configured pnpm toolchain, and Rust/Cargo. No new dependency,
model, CUDA, or application runtime was installed for this feature. Compatible
existing dependencies and immutable Runtime outputs were reused; profiles, logs,
test data, and final build outputs were isolated in the request worktrees.

- Initialize a clean checkout with the documented frozen-lockfile install.
- Start with `pwsh -File scripts/start.ps1` (existing `pnpm dev` wrapper).
- Verify the project with `pwsh -File scripts/verify.ps1`.
- Run the isolated feature journey with `pnpm test:e2e:navigator` after building
  the current Desktop/Host. `PI_DESKTOP_HOST_BIN` may reference a compatible
  candidate Host build; it is a test override, not a production path dependency.

## Compatibility and unverified scope

- Schema v21 upgrades to v22 with a migration backup and preserves existing data.
  A binary limited to schema v21 cannot directly open the upgraded database;
  use the preserved backup for rollback rather than deleting application data.
- Imported native Pi sessions lack local Host turn ownership and display an
  explicit unsupported Navigator state; their existing chat remains available.
- Non-English/non-Chinese locales currently fall back to the English Navigator
  catalog. Actual provider quality, remote pi-host, other operating systems,
  installer/updater qualification, and visual inspection are not certified here.
- The 46 Desktop skips remain explicit platform/optional-test exclusions.
  No paid/live model, user-owned running Desktop, or `verify:ui:*` was used.
- PR integration/remote CI status is reported with the final PR; local results
  alone are not a claim that the remote merge gate has passed.

No merge or application publication is included in this implementation task.
