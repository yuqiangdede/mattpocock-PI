# PI-Desktop 0.20.1 integration

## Source and compatibility

- Fork base: `4b8773cc1e71b1272d126b46329b94dcf863207d`.
- Official baseline: `0.18.0`, `0c0902b25f0cc22a00fabbf98dee35f499f149cf`.
- Official target: `v0.20.1`, `cb88131b34680afd45d931a37d4bd0a7893f29ed`.
- Fork application, workspace and Cargo versions: `0.20.1`.
- Official release: <https://github.com/vastsa/PI-Desktop/releases/tag/v0.20.1>.

The fixed-baseline preview contained 525 files and 59 conflict records.
Adopt upstream remote project/provider/workspace contracts, S3 configuration
synchronization, provider no-auth configuration, browser and overlay fixes,
turn-stop ordering, transcript layout validation and macOS stapling retries.

Preserve fork branding, manual update delivery, document workflow resources,
Matt Skills, Coding Actions and interview flows, retained Workflow/Free Task
contracts and the fork's own release history. Keep intentionally removed
upstream CI/release publishing workflows and lazy locale/changelog catalogs
removed. No installed application or paid provider is used for qualification.

## Integration decisions

- Upstream built-in Skill activation also accepts the existing bounded
  `pi-desktop:<name>` document IDs. The catalog, agent visibility, stale body
  request checks and restart persistence share existing owners. A failing
  Host regression demonstrated the rejected document ID before the fix.
- Preserve tolerant UTF-8 transcript views while using upstream versioned,
  identity-validated layout caches. Both physical layout scans and indexed
  line reads count original bytes and retain the fork's recovery behavior.
- Abort waits on prompt admission even without an explicit turn ID, then
  forwards the captured turn ID. Retain Workflow/Free Task acknowledgment,
  refusal and terminal ownership checks. The upstream prompt/stop regression
  failed before adaptation and passed afterward.
- Remote approval fixtures explicitly select Ask; production retains the
  fork's existing Auto default. Do not change permissions to satisfy a fixture.
- Preserve legacy engineering preference keys and complete guidance for Skills
  outside the curated shortcut menu. Update stale assertions to match these
  existing compatibility contracts and the current two-row document UI.
- Package the Windows update feed with the fork repository and artifact names.
- Repair repository-root policy links for the VitePress site by linking their
  GitHub sources; the document build keeps dead-link checking enabled.

## Validation

Evidence and isolated fixtures are retained under `cache/upstream/`.
A request-local frozen-lockfile install was required because Pi's audited
patch hash changed and this worktree had no compatible dependencies. Package
bytes were reused from the host store; offline metadata was incomplete.
Electron 43.6.0 is reused from the primary checkout without another download.
Host Cargo artifacts reuse the existing host target cache.

Final validation and delivery revisions are recorded after candidate checks.
Source adoption does not publish an installer or certify signing, updater
installation, real SSH machines, paid providers, or native macOS/Linux behavior.

Windows remote permissions normalize POSIX paths independently of the local OS; containment regressions cover in-root, parent traversal and sibling-prefix paths. Configuration-sync mappings use the same canonical spelling as the Host project database, including projection of existing mappings, so extended Windows paths retain capability identities across approval and repeat synchronization.

### Verified source gates

- Full workspace JavaScript build, all package typechecks, lint and release-version documentation checks passed.
- Shared: 1,262 passed. Agent Runtime final single-worker run: 1,359 passed, one explicit skip.
- Plugin SDK / DevKit / Agent Host / Host Runtime / i18n / RACP / Voice: 382 / 52 / 65 / 117 / 30 / 27 / 51 passed; Host Runtime has three existing skips.
- Desktop initial complete sweep: 3,917 passed, 22 failed, one cancelled, 59 skipped. All failed files were rechecked after provisioning or compatibility updates; the final selected recheck passed 77 tests with 10 explicit platform skips. Electron S3, no-key custom provider and Jev setup/card paths passed. Coding Actions' complete interactive Electron journey passed.
- npm executable regressions passed with unchanged deadlines: nine passed, four platform skips, using a hidden Windows launcher and project-local temporary files. Earlier runs using the host temporary directory hit wall-clock fixture limits; this remains a qualification environment sensitivity.
- Document/safety suites passed. Rust formatting and clippy passed; clippy retains warnings. Final full Host regression: 888 passed, zero failed, one existing ignored test.

### Data and platform limits

The upstream S3-only configuration sync uses a separate namespace; historical WebDAV data stays intact but is not migrated into S3. Configuring S3 remains an explicit user action. POSIX-only pi-host installers and Unix admin sockets are explicitly skipped on Windows; directory containment is exercised with actual Windows junctions, while privileged file-symlink fixtures are skipped. The pi-host Windows-compatible tests passed 21 cases with 41 explicit platform skips.

### Committed task candidate

- Source commit: `584a97affaed29975428b02c1163e4ae35d4143d`.
- Acceptance fixture commit: `30a42bc814d7bc1d2ae9694591df104b9914df3f`.
- Base main: `4b8773cc1e71b1272d126b46329b94dcf863207d`.
- `apps/`, `packages/` and `crates/` are unchanged between those candidates.
- Committed Electron cold boot passed at application 0.20.1 with 800 sessions: eight list reads 86–245 ms and max Main heartbeat gap 45 ms.
- Four-device local S3 E2E passed with signed requests and ciphertext checks, restore/restart and disconnect checks; all 43 fixture objects were removed.
- Final Coding Actions E2E passed migration, CRUD, order, enabled state, explicit execution, latest Skill content, missing/corrupt fallback, ordinary chat and restart persistence. It checks that optional Skills absent from the native catalog remain hidden, rather than inventing availability.
- Plan history, storage/bootstrap migration and browser local-file E2E passed. No `verify:ui:*` command was used.
- POSIX remote-model/tool E2E is not certified on Windows; its fixture requires a POSIX workspace and shell. Local permission/containment contracts passed nine Rust tests, and remote renderer/component suites passed in the Desktop sweep.
- Final request head adds this evidence only. PR integration validation compares the actual merge tree with the validated request and reruns isolated acceptance before merging.
