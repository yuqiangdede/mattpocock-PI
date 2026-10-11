# PI-Desktop 0.18.0 integration and engineering boundaries

## Candidate and scope

- Fork base: `9ab1f8f07`; branch: `codex/upstream-0.18.0`.
- Previous official baseline: `0.17.0`, `72b5e826cb7a9928467091ccf745aa9b225eeb04`.
- Official target: `v0.18.0`, `0c0902b25f0cc22a00fabbf98dee35f499f149cf`.
- Release: <https://github.com/vastsa/PI-Desktop/releases/tag/v0.18.0>.
- Source adoption targets the fork's main branch; it does not publish an
  installer or update an installed Desktop instance.

The fixed-baseline preview contained 456 files and 31 conflicts. Resolution
preserves fork branding, manual updates, Hikvision onboarding, Coding Actions,
engineering skills, retained Workflow data and Host APIs. Compatible upstream
plugin, model, runtime, persistence, window and documentation changes are adopted.
The final base refresh preserves the new Commit code draft entry and first-row
Skills menu from remote main. The viewer remains available during execution.

## Pi 1.1.0 and the Desktop adapter

The three `@earendil-works` packages and patches move together to `1.1.0`.
Both Pi dependency and patch checks verify installed instances and lock hashes.
The primary dependency tree contained Pi 1.0.1, so a frozen-lockfile install in
the request worktree was necessary. It reuses the host package store and
toolchain; it does not modify the primary dependency environment.

`AgentRunState` is a Desktop-owned shared projection, not an exported Pi type.
The runtime adapter owns Pi `isStreaming`, structured abort/error outcomes and
monotonic durations. The UI consumes Desktop events and contracts. Pi remains
busy until awaited `agent_end` listeners settle; Desktop compaction, recovery
and delegate waiting remain additional busy conditions. Terminal events expose
the completed/aborted/error outcome while status preserves settlement ordering.

Tool `durationMs` measures `execute()`, not permission waiting or renderer wall
time. Finite nonnegative values, including zero, take precedence; absent or
invalid values retain the existing elapsed-time fallback. Host and renderer
persist that value in the existing `toolDurationMs` field without a migration.

Raw Pi events have no durable run ID. Existing admitted Host turn ownership,
turn epochs and sidecar expected-turn guards continue to fence stale work.
The adapter does not invent identities from current mutable session state or
drop legitimate terminal callbacks after cancellation.

## Upstream contracts analyzed

### Plan

`plans.submit` remains the Host-owned immutable Markdown checkpoint contract:
artifact location, bytes/hash, approval state and execution admission are
validated at their existing boundaries. A task graph is an inspection of issue
dependencies; it is not a Plan approval and cannot start an execution.

### Explicit MCP selection

`mcp-tool-selection.ts` resolves the exact servers/tools selected in a prompt.
Declaration visibility does not authorize execution. Deferred tool activation,
mode restrictions and existing permissions continue to apply. The viewer does
not select MCP servers or widen tool access.

### Subagent recovery

Upstream PR #1527 tags restored delegate assistant history with `model.provider`;
`resume-provider-identity.test.ts` covers the account/provider identity. Parent
failure settlement retains resumable reports and explicit `resumeId` recovery;
it does not silently replay a cancelled delegate. Recovery, malformed/empty
compaction summaries and mutation failures retain their separate typed outcomes.

### Plugin extension seams

`composer.transform` provides an explicitly invoked draft text transformation
with undo and bounded input, not a privileged execution path. Plugin-owned API
key services appear in Add Service through permission-checked contributions.
These seams are adopted for future Skills integration; this request does not
create a replacement agent engine or migrate Coding Actions to a new provider.

## Task graph viewer and Skill gates

The `implement-spec` Coding Action opens a read-only task graph dialog. Paste
`{ "tasks": [{ "id": "T1", "title": "Implement", "status": "pending",
"blockedBy": [], "url": "https://github.com/example/repo/issues/1" }] }`.
Statuses are `pending`, `running`, `done` and `aborted`. The viewer rejects
malformed input, duplicate IDs, unknown dependencies, cycles and unsafe URLs;
it bounds input to 1,000 tasks and 1,000,000 characters. URLs are source text.

The pending frontier is informational. There are no dispatch, retry, automatic
close or tracker-write operations. JSON is an explicit local snapshot; this
request does not imply authenticated live tracker synchronization. Existing
persisted Action configuration is unchanged; other Skills remain draft-first.

Key Skills expose separate display-only gate metadata for scope, tests,
review, publication authorization and Hook inspection. Actual safety remains
with CLI permissions or Hooks; selecting or satisfying a displayed gate grants
no permission and does not replace execution checks.

## Validation evidence

Logs and isolated fixtures are under `cache/upstream/`.
The final Coding Actions and task graph journeys, seven focused component
tests, Desktop typecheck, lint and PR-base checks ran after the base refresh.
Runtime and Host suites apply unchanged executable code from the previous
base; the incoming commit only touches Composer, Coding Actions, i18n and docs.
`cache/upstream/candidate-manifest.json` records the original working-tree
candidate. Final delivery records the committed task and PR integration tree
separately; passing source gates is not installer release qualification.

| Check | Observed result |
| --- | --- |
| Pi pins and audited patch contracts | Passed for all three 1.1.0 packages |
| Workspace build and typecheck | Passed via pnpm typecheck, including Docs and Desktop |
| Runtime regression | 1336 passed, one explicit skip; final adapter paths 357 passed |
| Native discovery and session compatibility | 46 passed after the cold-load fix |
| Shared | 1166 passed |
| Plugin SDK / DevKit / Agent Host / Host Runtime | 382 / 52 / 57 / 117 passed; Host Runtime three skips |
| i18n / Docs tests | 30 / 13 passed |
| Desktop targeted final checks | 108 passed; six duration cases and task graph interaction also passed |
| Full Desktop initial sweep | 3682 passed, 21 failed, 46 explicit skips; failed paths rerun individually after provisioning/adaptation |
| Rechecked upstream settings user paths | Jev setup/card, plugin Provider, MCP import and subagent fallback each passed |
| Offline Electron journeys | Task graph 10 checks, Plan history, explicit Composer MCP, subagent recovery/stop/edit isolation passed |
| Full Coding Actions Electron journey | Passed migration, CRUD/order/enabled state, explicit execution, latest Skill, corrupt fallback and restart persistence |
| Cold Electron boot / 800 sessions | Passed unchanged 1s gate; eight list reads 110–333ms, max Main heartbeat gap 83ms |
| Static gates | lint, Rust formatting, clippy, release docs, agent policy and docs checks passed; clippy warnings remain |
| Full Host regression | Final rerun: 842 passed, zero failed, one existing ignored test |

Earlier Host runs failed the Git Bash scratch-directory fixture at its original
15s deadline under ordinary, hidden and serial launches. After three consecutive
exact-test passes, the full gate passed in 44.98s. No source fix or specific
environmental root cause is claimed; the earlier startup sensitivity remains a
known risk. No timeout or assertion was weakened and that test was not skipped.
Coding Actions acceptance now yields through browser tasks instead of hidden
window animation frames, and waits for saved state and editor focus before
navigation or keyboard submission. Its production contracts are unchanged.
The existing npm deadline fixture passed with unchanged assertions through a
hidden Windows launcher; ordinary launch was sensitive to subprocess startup.
POSIX-only signing/bootstrap fixtures explicitly skip on Windows, consistent
with the fork's existing platform policy.

The cold-list failure was an existing lazy-loading defect, not proven to be
introduced by Pi 1.1. A shared lightweight native-root resolver now checks an
unavailable root before importing the heavy service. Existing native roots
retain service semantics; concurrent loading shares an owner and failed loads
can retry. The boot fixture isolates all home/app-data directories and does not
read the user's native sessions.

Paid/real models were not called because the task did not authorize paid
provider use. Installer/update delivery, macOS/Linux native behavior and the
remaining broader release qualification suites were not exercised. This is
source integration and targeted validation, not an installer release.
