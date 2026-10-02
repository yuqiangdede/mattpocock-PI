# Engineering Workflow V0 Delivery Acceptance

Date: 2026-10-02. Scope: the six published implementation slices #5-#10;
this record does not qualify a cross-platform application release.

## Landed candidate and evidence provenance

- Delivery: [PR #12](https://github.com/yuqiangdede/mattpocock-PI/pull/12), merged.
- Tested request head reported by the PR: `af777fc635408f7b7733e81aa7aaf9349f45959d`.
- Base main: `c1e3da0f4c9cb223781f63760621097ab3e056c4`.
- Landed main: `0bdc746b721fd17305e8103503aa1f52d44a23a7`.
- The closeout review compared request head and landed main: their complete
  tracked trees are identical. No conflict resolution changed executable code.
- Issues #5-#10 received acceptance comments identifying reviewed coverage,
  fresh versus historical results and release limitations, then were closed
  with the completed reason. Their closed states were read back from GitHub.
- The merged PR reports JavaScript build, Desktop typecheck and lint passing;
  recursive JavaScript tests report 6310 passed, zero failed and 45 explicit
  platform/workflow skips. It reports all six Workflow E2E suites passing and
  remote-host checks passing 25/25. These are historical delivery results,
  not commands rerun by this closeout review. Raw historical logs are not
  attached to this record.

## Acceptance mapping

The review read all six issue bodies and inspected the landed user journeys,
IPC contracts and host tests. Existing tests cover the following requirements;
source inspection alone is not reported as a runtime test pass.

| Issue | Observable behavior and reviewed evidence |
| --- | --- |
| [#5](https://github.com/yuqiangdede/mattpocock-PI/issues/5) | Native run creation, project/session navigation, archive and retained unavailable history: `scripts/e2e/workflow-runs.tsx`; host tests in `crates/host-core/src/db/workflows.rs` cover racing creation, malformed/future documents, rename, stale writes and restart with unrelated data. |
| [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6) | Real Skill loading, admission blockers, ordinary queue preservation, renderer reload and interrupted restart: `scripts/e2e/workflow-discovery.tsx`; `executions/tests.rs` covers terminal/admission ordering, duplicate requests, session ownership and stale revisions. |
| [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7) | Explicit Stop/Retry/Continue, cancellation failure, mismatched acknowledgement reconciliation and stale Stop isolation: `scripts/e2e/workflow-recovery.tsx`; host execution/recovery tests retain attempts without replay or fallback acceptance. |
| [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8) | Full six-stage journey, repeated Implement, explicit Review/Retro acceptance, busy/queued and stale rejection, done history/new run: `scripts/e2e/workflow-stages.tsx`; `stages.rs` tests prerequisite and current normal execution gates. |
| [#9](https://github.com/yuqiangdede/mattpocock-PI/issues/9) | Reopen cancellation/confirmation, Return to Implement, earlier stage preservation, restart and read-only archive: `scripts/e2e/workflow-reopen.tsx`; host `reopen.rs` and Desktop `workflow-history.test.mjs` cover revisions and historical decisions. |
| [#10](https://github.com/yuqiangdede/mattpocock-PI/issues/10) | Register/open before execution, project isolation, delayed opening, historical references, missing files/roots and restart: `scripts/e2e/workflow-artifacts.tsx`; `artifacts.rs` covers all kinds, wrong roots, traversal, escaping links and immutable history; `workflow-artifacts-ipc.test.mjs` covers file-reader permissions and host/path changes. |

The existing AC-01 through AC-20 ticket mapping remains in
[the ticket record](engineering-workflow-v0-tickets.md#acceptance-coverage).
The product scenarios are documented in
[the E2E plan](../spec/06-delivery/04-e2e-test-plan.md).

## Closeout checks and limitations

- Repository policy synchronization and current-main ancestry checks passed.
- Fresh `cargo test -p host-core --locked --offline db::workflows --
  --test-threads=1`: 27 passed, zero failed/ignored; 710 unrelated tests filtered.
  This ran on the landed main code plus documentation-only closeout changes.
- `cargo fmt --check` passed. Changed-document UTF-8, local links and
  `git diff --check` passed.
- `cargo clippy -p host-core --all-targets --locked --offline` passed with
  existing `created_at` dead-code and test `guard` unused-variable warnings.
- `node scripts/check-release-docs.mjs` failed: TypeScript is not installed
  in this worktree, and the checker expects `0.16.0-beta.1` in the version list.
  The repository policy excludes prerelease-only versions unless explicitly
  shipped in app notes. This release gate needs rechecking in a provisioned
  release environment; it is not reported as passing or fixed here.
- Electron E2E, JavaScript tests/build/typecheck/lint and packaged application
  checks were not rerun: neither this request worktree nor the primary checkout
  has the installed JavaScript environment or Host binary. No second dependency
  environment was installed solely for this documentation closeout.
- No paid provider, user-owned running Desktop, deployment or release was used.
- Windows fixture acceptance does not establish macOS/Linux installer,
  signing/notarization or real-provider qualification. Those remain release gates.
- Keep existing databases when reverting additive Workflow persistence.
- Other requests' worktrees and branches were preserved.
