# Continue task launcher

## Unreleased

- Add Continue immediately after Commit code in Coding Actions. Clicking it prepares an editable continuation prompt that checks progress and resumes unfinished work, retaining the existing draft and attachments.
- Continue remains available if the Commit action is hidden. It respects the launcher disabled state and never submits automatically.

Validation: `node --test apps/desktop/test/coding-workbench-shortcuts.test.mjs apps/desktop/test/coding-prompt-user-path.test.mjs`.
