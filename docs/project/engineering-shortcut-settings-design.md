# Engineering Shortcut Settings and Skill Updates

Date: 2026-10-03
Status: User-confirmed design; implemented candidate, release pending.

## Confirmed user decisions

- Settings exposes editable instructions for all 26 engineering skill shortcuts.
- Custom instructions are global and shared across projects.
- A per-shortcut restore-default action uses the current built-in instruction.
- Application upgrades and engineering skill updates preserve custom instructions.
- Skill selection continues to edit the current draft; Send remains explicit.
- Two update modes: automatic detection with manual installation, or fully manual detection and installation.
- Automatic detection is the default: check on application startup when due, then at most once per 24 hours. New-version status appears in skill settings; installation remains manual.
- An explicitly saved empty shortcut instruction inserts only the skill marker. Absence of a customization uses the current localized built-in instruction.
- Ship the latest verified upstream snapshot at release preparation for offline use.

## Current evidence

The existing skill settings page supports explicit bundle installation updates.
Main fetches and validates one immutable upstream revision; Host preserves
locally changed or removed packages and activation state. User-owned skill
definitions take precedence over the bundled fallback.

The public GitHub main revision verified during discovery is
`d81f3a183412e71a5b1e84ca21bc1a35eea03a60`. The embedded bundle records that
same upstream revision plus `-desktop.1`, with 37 packages. The latest upstream
snapshot is therefore already included at this discovery point.
Source: https://api.github.com/repos/mattpocock/skills/commits/main

A bundle manifest revision can advance while modified local packages remain
unchanged. Settings must distinguish the selected upstream snapshot from
preserved packages rather than claiming every package was replaced.

## Proposed settings experience

Extend Settings > Agent > Skills with Engineering shortcut instructions and
Engineering skill updates. Each instruction has a labeled editor, save and
restore-default actions. Custom text is independent of skill documents and
bundle lifecycle; editing settings does not rewrite an existing Composer draft.

The update area displays the installed snapshot, last successful check,
available upstream snapshot, checking/updating state, failures and preserved
packages. Check now detects without installing. Update explicitly installs
the validated snapshot through the existing Host-owned update mechanism.

## Approval

The user accepted all recommended decisions and explicitly requested implementation.

## Verification requirements

Cover save/restart/read/use, per-item restore, user customization surviving
application/default changes, unchanged existing drafts/attachments, both
update modes, check without install, no-change checks, offline failures,
concurrent checks/updates, Host restart and disposal, local package preservation,
and representative settings-to-shortcut and check-to-manual-update user paths.
