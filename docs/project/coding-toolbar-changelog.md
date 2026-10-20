# Coding toolbar changes (unreleased)

- Repair drafts now include a concise review handoff instead of copying the full
  report. The entire handoff, including its notice and latest clarification,
  stays under 600 Unicode characters. Structured reviews retain finding titles
  and locations; a localized notice points back to the complete source and requires verification before
  fixing. Existing drafts, attachments and manual Send remain unchanged.
- Shorten the Chinese primary action labels and place Continue after Compile.
- Keep the Requirements dropdown with Text discussion and Visual discussion.
- Add a single accessible toggle to collapse and expand both shortcut rows while
  preserving the current draft, attachments, errors and active work panels.

## 2026-10-19 — Concise recommendation handoffs

- Recommended actions now carry a local, deduplicated extract of the goal and
  final answer (up to four bullets / 600 Unicode characters), prioritizing
  decisions, artifact paths and unresolved work instead of copying 8000 characters
  of assistant replies. Long excerpts show an ellipsis; full history stays in
  the conversation. Existing drafts and attachments are preserved.
- The repair action's Chinese default instruction is under 200 characters. Its
  review/follow-up handoff is under 600 characters rather than up to 12000;
  verification, minimal fixes, regression coverage and manual delivery remain.
- Repair stays enabled after fenced-only reviews. Followup answers must belong
  to the latest user turn. Handoffs extract user goals after known launcher
  prompts, preserve literal glob scopes, and retain headings with their conclusions.
