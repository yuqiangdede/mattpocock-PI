## Windows JavaScript validation

JavaScript tests use native path separators. Unix executable and macOS
release shell fixtures are explicitly skipped on Windows; SSH key transport
still exercises real Node subprocesses, including timeout and forwarding
cleanup. Workflow source checks explicitly skip workflows absent in this
fork rather than counting them as successful checks.

The remote host stores credentials in a protected Windows ACL directory:
only the current user, SYSTEM and Administrators receive access. Unix files
retain mode 0600. Existing identities and device records survive reloads.
Workspace browsing uses native relative containment and refuses escapes.

Extensionless MP4 attachments use a hard link on Windows, avoiding elevated
symbolic-link privileges and byte copies. An existing alias is accepted only
when it identifies the same file; unrelated occupants remain rejected.
