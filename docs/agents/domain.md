# Domain Documentation

Layout: single-context. The repository is a monorepo, but the current workflow
domain uses one root glossary and the existing shared ADR directory. Package
boundaries do not by themselves require separate domain glossaries.

## Before domain exploration

Read root `CONTEXT.md` when present and relevant decisions under `docs/adr/`.
If a root `CONTEXT-MAP.md` is introduced later, follow it to the contexts
relevant to the task. Continue when a glossary does not exist; domain-modeling
creates it when terms are resolved, rather than creating an empty placeholder.

Use glossary terms in specs, tickets, design discussions, and tests. Surface
conflicts with existing ADRs explicitly. Verify current code, types, schemas,
and tests before treating a decision record as proof of executable behavior.

Repository policy remains in `AGENTS.md`; product contracts remain under
`docs/spec/`. Read the nearest scoped agent rules and relevant specifications
before implementation. ADRs explain trade-offs; they do not replace contracts.

## Maintaining the configuration

Edit these configuration documents directly when tracker or vocabulary choices
change. Re-run setup when switching trackers or deliberately resetting the
configuration. Existing glossaries, ADRs, and user edits must be preserved.
