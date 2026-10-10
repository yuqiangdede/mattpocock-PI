# mattpocock-PI

mattpocock-PI is a software-engineering extension for PI-Desktop, integrating [Matt Pocock Skills](https://github.com/mattpocock/skills) and configurable Coding Actions.

Current fork release line: `0.17.x`; official source baseline: `0.17.0`.

## Three-stage product roadmap

| Stage | Positioning | Status |
| --- | --- | --- |
| **Skill Launcher** | Make Matt Pocock engineering methods clickable Coding Actions, executed by the current native Pi Agent. | Current foundation |
| **Development Navigator** | Organize multiple native Pi conversations and engineering artifacts around **Work Items**; begin with grouping, Spec/Tickets handoff and recovery in a standalone Navigator page. | Product direction decided; incremental planning |
| **Engineering Control Surface** | Make requirements, design, implementation, tests and review inspectable, selectable, comparable and traceable at engineering scale. | Long-term direction |

**Stage two uses Matt Pocock Skills only at first**: `setup-matt-pocock-skills` (engineering-skill setup), `grill-with-docs` / `to-spec` (requirements and specification), `to-tickets` (task breakdown), and `implement` (development), with `diagnosing-bugs`, `tdd`, `code-review`, `pr`, `retro` and `handoff` on demand. These are optional actions, with **no enforced order or automatic advancement**.

A Work Item is an optional, goal-specific grouping for multiple existing Pi sessions; ordinary ungrouped chats remain fully supported. The first delivery is a standalone Navigator page, not a change to PI-Desktop's core Session lifecycle or sidebar. Superpowers / ECC integration and cross-framework orchestration are **out of scope for stage two** unless a later evidenced need warrants revisiting the decision.

[Stage-two positioning (Chinese)](docs/project/development-navigator-positioning.md) · [Work Item and standalone Navigator design](docs/project/development-navigator-work-items.md) · [Skill Launcher spec](docs/project/skill-launcher-spec.md) · [Navigator first-release issue #46](https://github.com/yuqiangdede/mattpocock-PI/issues/46)

[PI-Desktop](https://github.com/vastsa/PI-Desktop)
