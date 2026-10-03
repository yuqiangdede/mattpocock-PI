# Engineering skills distribution

Status: Implementation candidate; installer qualification is recorded separately.

## User outcome

Install PI-Desktop, configure a model, and use Matt Pocock engineering skills
without a separate skill installer or a developer-machine skills directory.
The shipped catalog contains all 37 skills and their 102 companion files,
including the six Workflow skills and their auxiliary dependencies.

The default Settings > Agent > Skills list and empty slash-suggestion list expose six
skill entries: grill-with-docs, to-spec, to-tickets, implement, code-review and
retro. Searching, typing a slash name, or selecting Show all skills exposes the
other installed skills. Visibility never removes a skill from the execution
catalog or the Skill tool. Existing non-skill slash commands remain available.

## Ownership and updates

The Rust Host ships the offline bundle inside its executable and installs it
under the selected application profile. Existing global/project skills take
precedence over the shipped fallback. The ordinary skill controls can disable,
edit or remove an installed skill. Startup never re-enables, overwrites or
reinstalls a removed skill after initial installation.

Settings offers automatic detection with manual installation (the default)
and fully manual detection and installation. The default checks at startup
when due and at most once per 24 hours afterward. Attempt timestamps persist,
including failures; failures do not retry on every scheduler tick. Status and
new versions appear only in the skill settings page. Check now always permits
an explicit retry without installing. Neither mode installs automatically.

Update engineering skills is an explicit user action on that page. Main uses
the existing public-HTTPS policy to fetch one immutable revision of
https://github.com/mattpocock/skills. The complete bundle must validate before
Host installation. Network failure, incomplete source trees, links, unsafe paths
and oversized content leave the active installation intact. CONTEXT terminology
is retained by the distribution's GLOSSARY-to-CONTEXT adaptation.

Host writes replacements into new directories and atomically switches the
versioned manifest using opened directory handles. Changed or removed local packages are skipped and reported. Activation
state persists across updates. Old versions remain on disk for recovery; the
first iteration does not garbage-collect them. Existing user skill files are
not overwritten. Restarting Host during a download refuses the stale update.
Bundled entries do not consume user-owned skill capacity or prevent a later
same-name user definition from taking precedence. Unsafe links cannot redirect
installation or update writes outside the profile.

The initial bundle records upstream revision
`d81f3a183412e71a5b1e84ca21bc1a35eea03a60` and the existing local CONTEXT adaptation.
It preserves the locally maintained ask-matt, implement-spec and retro variants
in this first distribution; explicit upstream updates can replace unedited
bundled variants. The separately installed Codex skills are not modified.
The upstream MIT license is included in the Windows package.

## Acceptance

- A fresh packaged Desktop, with an empty agents directory and isolated profile,
  installs the full catalog offline and exposes enabled definitions.
- The default native skill view shows exactly six entries; Show all and search
  expose auxiliary skills, and `/tdd` remains callable.
- Workflow Discovery loads the shipped grill-with-docs through the real Skill
  path after model configuration, retaining normal explicit acceptance rules.
- Restart retains identities, disabled state, edited content and removal.
- A manual update changes unedited content/resources, preserves user overrides
  and local modifications, and reports failures without partial activation.
- Packaged resources resolve from the installation and profile, with no Codex
  home or worktree dependency. Installer/application startup is exercised on
  Windows; cross-platform release qualification remains a separate gate.
