# Bundled document workflow release note

The documentation row now offers Requirements, Overall design, High-level design,
and Merge and convert format with application-bundled Skills. No manual skill
import is required after installing or updating the application. API documentation,
Database design, Test plan and Test report remain informational placeholders.

Selecting a document action prepares an editable draft; Send starts the workflow.
Merge and convert confirms the title and formatting inputs, merges the documents,
then invokes the bundled Markdown-to-Word converter. External conversion tools
are checked at execution time and are not installed automatically.

The five complete Skill directories were copied from the user-provided My-Prompts
work-use skill collection on 2026-10-15. Runtime lookup uses only application
resources. Local source directories are not a runtime dependency.
