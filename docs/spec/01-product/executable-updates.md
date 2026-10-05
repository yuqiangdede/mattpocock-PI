# Explicit application and engineering skill updates

Settings exposes two update sources: Matt Pocock skills and mattpocock-PI.
The upstream PI-Desktop version is not an independently installable source.
An application release contains only the upstream changes its maintainer merged.

Checks never download or install. Each source has its own update action.
Application channels are stable and prerelease; existing prerelease installs
default to prerelease. Only a strictly newer semantic version is actionable.
Channel changes invalidate previous check/download state and are persisted.

Installed Windows builds use the fork's fixed electron-updater feed. Downloads
are explicit, verified by the feed checksum, and never install on normal quit.
The user explicitly chooses Restart and update after running tasks finish.
Windows Portable/ZIP builds download a matching release artifact into the app
profile cache, verify the published checksum, and reveal it for manual replacement.
They never execute the NSIS installer. Development builds cannot install updates.
Errors remain visible and retryable; partial downloads are never revealed.

Skill updates reuse the existing immutable-revision download and Host validation.
Host snapshots the previous installed catalog in the profile before atomically
activating a replacement. Failure leaves the active catalog unchanged. Restore
last backup is explicit, preserves subsequent local edits, and switches atomically.
Global/project user skills remain untouched. Locally edited or locally removed
bundled skills are preserved and listed; unedited upstream-removed packages are
removed from the active catalog, with their files retained for recovery.
Updates and restore are rejected while any task runs, including tasks starting
while a download is pending. The UI explains the block.

Validation uses fixture feeds and isolated profiles, never live provider calls
or the user's running application. See the executable-update scenarios in the
delivery E2E plan.
