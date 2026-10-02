# Matt Pocock skill bundle

`workflow-skills.json` is an offline distribution asset embedded in host-core.
Its 37 packages include complete skill folders rather than only SKILL.md.
Source: https://github.com/mattpocock/skills at
`d81f3a183412e71a5b1e84ca21bc1a35eea03a60`.

The initial catalog uses the existing local CONTEXT naming adaptation and the
locally maintained ask-matt, implement-spec and retro documents. This is a
checked-in copy; the application never reads the developer's Codex installation.
Upstream MIT terms are retained in `workflow-skills-LICENSE`, also copied into
the packaged application's licenses directory.

Runtime updates are explicit, fetched through the guarded public HTTPS client,
validated by Host and installed into the selected profile. The updater applies
the same GLOSSARY-to-CONTEXT naming adaptation.
