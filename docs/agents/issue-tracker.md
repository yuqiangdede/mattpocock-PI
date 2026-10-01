# Issue Tracker: GitHub

Specs and tickets live in GitHub Issues for `yuqiangdede/mattpocock-PI`.
Use the connected GitHub tools when available; otherwise use an authenticated
`gh` CLI with `--repo yuqiangdede/mattpocock-PI`. Git remotes identify the fork,
not the upstream PI-Desktop repository.

## Operations

- Read issue title, body, comments, labels, and state before implementation.
- Publishing a spec or ticket creates a GitHub issue. Apply the label mapped
  to `ready-for-agent` in [triage-labels.md](triage-labels.md).
- Fetching a relevant ticket reads the issue and its comments.
- Use structured tool arguments for issue bodies and comments. With `gh`,
  write exact multiline content to a UTF-8 file and use `--body-file`.
- Preserve the issue URL and number in delivery evidence. A local draft is
  not a published issue, and configuring the tracker does not publish drafts.
- Update an existing issue when it already tracks the same work rather than
  creating duplicates. Labels describe readiness, not proof of completed work.
- Apply repository security and issue-intake rules to all external requests.

## Dependencies and ownership

Split multi-session work into self-contained tickets with explicit blockers.
Use native GitHub issue dependencies when the connected tool or authenticated
CLI supports them. Otherwise put `Blocked by: #<number>` links at the top of
each ticket and maintain the parent issue's task list. A ticket is eligible
only when its blockers are resolved; fetch their current states.

Issue creation, assignment, comments, and closure require authorization from
the current task or an explicitly invoked skill. Tracker configuration alone
does not authorize implementation, comments on unrelated issues, commits,
branch publication, or pull request creation.

## Pull requests as a triage surface

PRs as a request surface: no.

The repository's existing pull request intake policy still applies when the
user explicitly requests work on a pull request.

## Availability

If GitHub writes are unavailable, retain a local reviewable draft and report
the concrete blocker. Keep GitHub as the configured tracker; do not silently
switch to a second local tracker or claim publication succeeded.
