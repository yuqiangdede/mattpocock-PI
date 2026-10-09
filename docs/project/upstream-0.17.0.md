# PI-Desktop 0.17.0 source integration

## Candidate

- Initial fork base: `673d241d903444d2090a9a27474e676701d43ea5`.
- Refreshed fork base: `4c97b93b01d1cfdb55ece1d3cda6765657ebf1ce`;
  intervening main commits simplify the READMEs and repair icon transparency.
- Previous official baseline: `0.16.1`, `104c3613d3037bf0c600151d80e92a5cd73e161c`.
- Adopted official tag: `v0.17.0`, `72b5e826cb7a9928467091ccf745aa9b225eeb04`.
- Branch: `codex/upstream-0.17.0`.
- Fork application version is `0.17.0`; source adoption is separate from
  publishing the next customized release.

## Inherited behavior

The integration adopts upstream inline image and session-reference chips,
recent chat-model selection, explicit Composer MCP invocations, inline imports
in their owning Settings destinations, retained Plan history, resumable
subagents after a parent failure, plugin OAuth, proxy routing and bounded
transcript rendering. The official release notes are available at
<https://github.com/vastsa/PI-Desktop/releases/tag/v0.17.0>.

## Conflict decisions

The fixed-baseline preview reported 419 changed files and 42 conflicts.
Conflicts were resolved by responsibility rather than selecting a complete
source tree.

- Preserve fork identity, manual application updates, workspace versions,
  combined fork changelog catalogs and intentionally absent fork workflows.
- Preserve the Chinese README and project provenance while taking compatible
  upstream documentation and public-contract updates.
- Initialize bundled engineering skills and configure the new system-proxy
  relay after the Host handshake.
- Preserve the existing pre-ready Chromium maintenance directory and verify
  both local and upstream storage-maintenance assertions against it.
- Retain engineering-skill settings beside the new inline Skill import panel.
- Retain Coding Actions and version-source Settings. Actions insert the native
  `/skill:<id>` catalog name, preserve the draft, and require manual Send.
- Match historical Workflow and Free Task availability by stable `skillId`,
  retaining their host-owned bare markers and send-time active-skill checks.
- Adopt the legacy Edit partial-line preservation fix and register its missing
  `EDIT_LEGACY_MATCH_FAILED` error in the shared contract and both specs.
- Retain the fork Settings decision as ADR `extension-shortcut-settings`,
  preserving its content while reserving numeric ADR 0319 for upstream's
  independently adopted inline-import decision.
- Use a `file:` URL for the Composer MCP fixture's Node `--import` hook on
  Windows; a native absolute path is rejected as an unsupported `c:` scheme.
- Close the fixture's stdio MCP server before removing its session workspace;
  Windows retains the child's working-directory lock until the process exits.
- Run hidden transcript geometry checks with Chromium offscreen rendering so
  Windows frame scheduling remains active; keep native frames, the original
  assertions and the original 45-second limit.
- Select a scheduled task's model through the combined menu's directly focused
  search field; do not click the former separate model-list entry.
- Restore the draft selection before restoring an image chip's focus when its
  preview closes. Chromium's `Selection.addRange` otherwise focuses the editor
  again. The real native-window paste/preview journey reproduced this failure
  with a connected chip and the editor incorrectly focused.
- Use real active windows for native image-preview Tab/Escape checks and use
  file identity rather than `realpath` equality for Windows MP4 hard-link aliases.
  The Home-send history fixture delegates model-use recording to the real store.
- Preserve the fork's in-app Live Voice bar selectors while adopting upstream's
  plain-HTTP transport scenario; the upstream widget-window helper is absent here.
- Initialize the isolated Live Voice fixture with explicit relaxed endpoint
  policy and its first-use notice already acknowledged. This keeps an unrelated
  notice-triggered settings update out of the transport acceptance scenario.
  Preserve the single delayed provider greeting and the production transport.

## Validation

Logs and isolated fixtures live under `cache/upstream/` and
`cache/upstream-validation/`; they are not packaged application dependencies.

| Check | Result |
| --- | --- |
| Workspace build and typecheck | Passed; Desktop typecheck repeated after the version bump |
| Desktop regression | 3598 passed, 46 explicit skips, zero failures |
| Final Composer and Coding Action checks | 196 passed after the image-focus fix |
| Shared contracts and changelog | 1196 passed after the 0.17.0 bump |
| Agent Runtime | 1297 passed with one worker; an earlier two-worker attempt exited unexpectedly |
| Host core | 816 passed, zero failures |
| Other workspace packages | i18n 29; Plugin SDK 374; DevKit 49; Voice Runtime 51; Agent Host 57; Host Runtime 111 passed/3 skipped; RACP 21 |
| Docs | 13 tests passed; 89 locale pairs and 605 pages validated |
| Static guards | lint, Rust formatting, clippy, agent policy and release-doc checks passed |
| Candidate E2E | Boot/800-session responsiveness, Coding Actions manual Send, Composer MCP, recent models, Plan history, transcript rendering/responsiveness, subagent recovery, browser capture, model layout, storage and scheduled tasks passed |
| Native paste/preview E2E | Passed, including keyboard focus, inline image hover, video aliases and restart history |
| Live Voice | TLS and plain HTTP each passed all five fixture journeys; six targeted tests passed |

The Windows skips concern explicitly unsupported fixture capabilities, including
file symbolic-link permissions and workflows not configured in this fork.
Clippy reports non-fatal warnings. Real providers, physical audio devices,
macOS/Linux, installer packaging and updater delivery were not exercised by
this source-integration task.

The host dependency tree was initially reused. pnpm 12 automatically repaired
the task-local virtual-store metadata before its first script run, reused
cached packages with zero downloads and left the lockfile unchanged. Cargo
reused the host build cache; the newly built Host executable was copied into
the candidate's validation directory for isolated E2E execution.

## Usage

Use the Node/pnpm and Rust requirements in [the update guide](upstream-updates.md).
A fresh checkout initializes with `pnpm install --frozen-lockfile`, starts with
`pnpm dev`, and validates source adoption with `pnpm upstream:verify`.
Neither initialization nor runtime requires this developer's absolute paths.
