# Bundled grill-with-ui

The Stage 1 Requirements Discussion dropdown can launch the `grill-with-ui` Agent Skill.
The full upstream Skill is shipped in `apps/desktop/resources/skills/matt` as package `grill-with-ui` and installed by the existing bundled-Skills lifecycle. No separate Git clone or npm install is required.

- Upstream: https://github.com/jasonku09/grill-with-ui
- Source snapshot: `c8f699d3dd99eaf7af168e21acb355184a354f1b` (main at integration)
- Bundled files: `SKILL.md`, `server.mjs`, `page.html`, `LICENSE` (MIT)
- Runtime prerequisite: Node.js 20 or newer, accessible to the Agent shell environment.
- Lifecycle: the existing bundled Skill registry installs the package and preserves local user modifications on future updates. No change to Pi session ownership or Electron core lifecycle.

## Manual acceptance checks (not yet run)

1. Launch the desktop app with a fresh profile and verify `grill-with-ui` appears in the Skill catalog, with all four package files present.
2. Click Requirements Discussion dropdown → Visual Discussion. Verify the editor receives an editable `/grill-with-ui` draft. Submit and check that the Agent can start the Node server and open its local browser URL.
3. Answer a question in the browser, press Send to Agent, and verify the Pi Agent receives the event and continues. The browser server alone does not wake an ended Agent turn; verify foreground wait-mode support in the Pi runtime.
4. Resume after closing and reopening the conversation; verify pending events and state recovery. Finish and verify the generated design document.
5. Confirm that no duplicate installed Skill masks the bundled version and that failure to find Node yields an actionable error.

The bundle and UI shortcut are separate concerns. Bundling makes the Skill discoverable; it does **not** establish that Pi's wait-mode listener is compatible without the runtime checks above.
