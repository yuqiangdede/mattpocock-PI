# ADR 0315: Profile-managed engineering skill fallback

- Status: Implemented candidate
- Date: 2026-10-02
- Amends: ADR 0112 for first-party bundled skill sources; user-owned roots remain unchanged

## Context

The user requested an installer that supplies the complete Matt Pocock skill
set, enables it initially, exposes six Workflow entries by default, and allows
explicit updates while retaining local edits and activation choices. Requiring
a separate skill installer makes a newly installed Workflow unusable.

## Decision

Host owns a first-party fallback under the selected application profile. Its
offline catalog is embedded in the Host executable, including companion files.
An atomic manifest selects immutable package directories. Existing user-owned
global/project definitions retain their `.agents` roots and take precedence.
The new `bundled` source distinguishes this fallback in the existing skill
record contract. Default-entry visibility is independent of execution lookup.

Startup installs once; an explicit Main update fetches an immutable upstream
revision through existing HTTPS policy and passes validated content to Host.
Locally changed/removed packages are retained and enablement is not reset.
Old versions remain for recovery. No permission capability or execution engine
is added, and no SQL schema or existing user file migration is required.

Filesystem operations use opened directory handles with cap-std 4.0.3; resource
and manifest creation stays relative to that capability even when a link is
inserted between checks and writes. State format version 1 accepts the initial
unversioned candidate manifest and rejects unknown future versions intact.
See the [directory API](https://docs.rs/cap-std/4.0.3/cap_std/fs/struct.Dir.html).

## Alternatives

Installing over `.agents` documents would couple automatic defaults to user
files and risk collisions. Loading only read-only application resources would
make updates depend on an application upgrade and prevent ordinary editing.
The profile fallback keeps shipped content separately owned while reusing the
existing Skill catalog, activation state and resource-loading contracts.

## Consequences

Unedited installed defaults can follow upstream explicitly; existing custom
skills continue to win. Removed or locally edited defaults need a deliberate
user edit/reinstallation before they can be replaced. Retained versions consume
profile storage; automatic garbage collection is deferred. Product behavior and
acceptance are specified in the engineering skills distribution document.
