# Configurable Plain Prompt Buttons

Unreleased: Extensions > Coding Actions now configures the plain prompt
button names and instructions, including Commit code. Users can also add,
disable, reorder or delete these buttons. Selection prepares an editable draft;
only manual Send runs it. The default commit instruction skips compilation,
builds and packaging. It reports added, deleted and net code lines scoped to
the current commit, with binary files listed separately without estimated
line counts. Git push is allowed
only when the user explicitly requests it.

Existing configurations keep the localized default without being rewritten.
Saving plain prompt changes adds `promptActions` to `coding-actions.json`.
The existing backup before save preserves a configuration usable by older app
versions, whose strict validator does not accept the new optional field.
