# Configurable Plain Prompt Buttons

Unreleased: Extensions > Coding Actions now configures the second-row prompt
button names and instructions, including Commit code. Users can also add,
disable, reorder or delete these buttons. Selection prepares an editable draft;
only manual Send runs it. The default commit instruction still requires a
successful build and verification before Git or SVN commit, and excludes Git push.

Existing configurations keep the localized default without being rewritten.
Saving plain prompt changes adds `promptActions` to `coding-actions.json`.
The existing backup before save preserves a configuration usable by older app
versions, whose strict validator does not accept the new optional field.
