# mattpocock-PI

mattpocock-PI is a software-engineering extension for PI-Desktop, integrating [Matt Pocock Skills](https://github.com/mattpocock/skills) and configurable Coding Actions.

Current fork release line: `0.20.x`; official source baseline: `0.20.1`.

## Current Scope

Skill Launcher provides configurable Coding Actions using Matt Pocock Skills and the current native Pi Agent. Actions prepare editable drafts; execution requires explicit Send.

- [Skill Launcher specification](docs/project/skill-launcher-spec.md)
- [PI-Desktop](https://github.com/vastsa/PI-Desktop)

## Upstream Dependencies & Baseline Versions

This repository is built on top of the open-source ecosystem, including the official desktop host, the agent core engine, bundled skill suites, and third-party tooling specifications. The following tables document each upstream Git repository, current integrated version / commit, and maintenance path:

### 1. Core Host & Runtime Engine

| Dependency | Git Repository | Integrated Version / Commit | Description | Update Method / Script |
| :--- | :--- | :--- | :--- | :--- |
| **PI-Desktop** (Host Mainline) | `https://github.com/vastsa/PI-Desktop.git` | `v0.20.1`<br>(`cb88131b34680afd45d931a37d4bd0a7893f29ed`) | Official source baseline providing the Electron host architecture and native plugin system | `node scripts/update-upstream.mjs --version <new_version>`<br>(Baseline config: [`packages/shared/src/upstream.ts`](packages/shared/src/upstream.ts)) |
| **pi** (Agent Core Engine) | `https://github.com/earendil-works/pi.git`<br>*(formerly `badlogic/pi-mono`)* | `v1.1.0` | Core agent execution loop and foundational packages (`@earendil-works/pi-agent-core`, `pi-ai`, `pi-coding-agent`, etc.) | Maintained via local patches (`patches/@earendil-works__*.patch`)<br>Verification: `node scripts/check-pi-dependencies.mjs` |

### 2. Bundled Skills & Tools

| Dependency | Git Repository | Integrated Version / Commit | Description | Storage Path / Update Method |
| :--- | :--- | :--- | :--- | :--- |
| **Matt Pocock Skills** | `https://github.com/mattpocock/skills.git` | `d81f3a183412e71a5b1e84ca21bc1a35eea03a60` | Software engineering skill suite (tdd, code-review, codebase-design, grilling, etc.) | Path: [`apps/desktop/resources/skills/matt/`](apps/desktop/resources/skills/matt/)<br>Update script: `node scripts/update-matt-skills.mjs` |
| **grill-with-ui** | `https://github.com/jasonku09/grill-with-ui.git` | `c8f699d3dd99eaf7af168e21acb355184a354f1b` | Local browser-based visual requirements discussion and interview skill | Path: [`apps/desktop/resources/skills/matt/grill-with-ui/`](apps/desktop/resources/skills/matt/grill-with-ui/)<br>Guide: [`docs/guide/bundled-grill-with-ui.md`](docs/guide/bundled-grill-with-ui.md) |
| **diagram-design** | `https://github.com/cathrynlavery/diagram-design.git` | Main specification | Mandatory diagram generation capability for overall design (`overall-design`) and high-level design (`outline-design`) | References: [`apps/desktop/resources/skills/outline-design/references/diagrams.md`](apps/desktop/resources/skills/outline-design/references/diagrams.md) and [`apps/desktop/resources/skills/overall-design/references/diagrams.md`](apps/desktop/resources/skills/overall-design/references/diagrams.md) |

### 3. Plugin Ecosystem & Channels

| Dependency | Git Repository | Description | Verification / Maintenance |
| :--- | :--- | :--- | :--- |
| **PI-Desktop Plugins Channel** | `https://github.com/vastsa/pi-desktop-plugins.git` | Official Plugin Marketplace channel | `node scripts/check-marketplace-catalog.mjs` |
| **PI-Desktop Plugin Center** | `https://github.com/vastsa/pi-plugin-center.git` | Plugin registry management and review directory | Governed by [`docs/spec/07-plugins/`](docs/spec/07-plugins/) |
| **AIUO-Net Plugins Backup Channel** | `https://github.com/AIUO-Net/pi-desktop-plugins.git` | Designated GitHub backup channel for plugin distribution | See [ADR 0276](docs/adr/0276-official-plugin-channel-and-backup-channels.md) |

### 4. Design & Implementation References

| Project | Git Repository | Reference Purpose |
| :--- | :--- | :--- |
| **Anthropic Skills** | `https://github.com/anthropics/skills.git` | `requirements-spec` document review workflow references `doc-coauthoring` |
| **HumanLayer Skills** | `https://github.com/humanlayer/skills.git` | `matt/pr` visual diff checklist references `show-me` |
| **Awesome Copilot** | `https://github.com/github/awesome-copilot.git` | `markdown-to-docx` relative image embedding and styling references `skills/md-to-docx` |
| **Agent Skills** | `https://github.com/desmondc9/agent-skills.git` | `markdown-to-docx` Pandoc + Mermaid phased pipeline architecture |
| **piwin** | `https://github.com/mimimaster/piwin.git` | Live voice duplex session adapter reference (`docs/implementation/live-voice-evidence.md`) |
| **Opencode DCP** | `https://github.com/Opencode-DCP/opencode-dynamic-context-pruning.git` | Turn-boundary context compaction reference ([ADR 0030](docs/adr/0030-turn-boundary-context-checkpoint-compaction.md)) |
