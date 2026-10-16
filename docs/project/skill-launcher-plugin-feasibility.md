# Stage 1 Skill Launcher — Plugin Extension Feasibility Gate

> 2026-10-10 · Design/repository-source review only. No plugin prototype, running Electron verification, or migration is claimed.
> Scope: verify whether the **existing** Coding Actions can be implemented through PI-Desktop plugin APIs before changing native core/UI architecture.
> Related: [Skill Launcher](skill-launcher-spec.md).

## 1. Decision and sequencing

The current scope is Matt Pocock Skills and the lightweight Skill Launcher.

Before refactoring the launcher, conduct a **small, disposable plugin proof of concept**. A source-level extension surface is not proof that every current user interaction can migrate unchanged.

If feasible, prefer a plugin package and extension-owned UI; keep the native Pi Skill Catalog/Loader, Session, Turn, permissions and prompt sending authoritative. If plugin APIs cannot meet the gates, preserve the current launcher and use narrowly scoped first-party adapters; do **not** weaken host permissions or alter core lifecycles.

## 2. Observed existing implementation

Source inspected on this repository's main line / candidate docs branch:

- `apps/desktop/src/features/coding/CodingWorkbench.tsx`: current first-party React shortcut toolbar, More menu, disabled/missing Skill diagnostics, and configuration entry.
- `apps/desktop/src/features/coding/useCodingActionLauncher.ts`: asynchronous config/catalog lookup, prevention of stale session/project selection, draft preservation, and manual send boundary.
- `apps/desktop/src/features/coding/execute-coding-action.ts`: resolves an Action to an effective native Catalog command and inserts its slash marker into the editable Composer draft.
- `packages/plugin-sdk/src/renderer.ts`: supported renderer slots include `composerControl` and `composerTrigger`; outbound actions include `composer.insertText`, `composer.readDraft`, `composer.replaceDraft`.
- `packages/plugin-sdk/src/renderer-composer.ts`: draft snapshot and mark preservation; `replaceDraft` needs an up-to-date generation, an immediate user-input event, the Composer **not** focused, and retention of all host marks. An asynchronous plugin/Host lookup does not automatically satisfy this rule.
- `docs/adr/0104-plugin-contributed-work-panel-views.md`: plugins can contribute an isolated Work Panel view (`contributes.views`, `ui.view`).
- `docs/spec/07-plugins/03-plugin-api.md`: plugin-private configuration and panel API exist; `desktop.control` is a separate privilege for reviewed operations.
- `docs/adr/0219-user-invoked-skills-in-composer.md`: the native Composer already resolves `/skill:<id>` through the effective merged active Skill Catalog at send time, without replacing the Pi agent execution path.

These sources make a plugin **plausible**, but the full parity of the shortcut UI and resolver is **not yet demonstrated**.

## 3. Capability and gap matrix

| Stage-1 requirement | Native plugin surface | Current assessment / required proof |
| --- | --- | --- |
| Render several Matt shortcut buttons near Composer | Trusted `renderer.extension` with `composerControl` | Possible in principle; verify exact placement, responsive layout, localization, load/unload, and permission review |
| Keep existing text, file/image refs and Composer marks | `composer.readDraft`, `composer.insertText`, `composer.replaceDraft` | **Critical gate**: reproduce current marker insertion, caret behavior, and no-loss attachment invariants; `replaceDraft` has user-event/focus/generation constraints |
| Choose only **effective installed and active** Matt Skills | Native Catalog and `/skill:<id>` command | Must verify a plugin can read the effective current-project Catalog **without** copying the loader's precedence or claiming access via undeclared API; if not, a narrow read-only adapter may be justified |
| Preserve explicit Send / no auto-execution | Native Composer draft actions; send-time Skill resolver | Should remain intact; plugin must only prepare the draft and must never call `agent/prompt` to simulate a button click |
| Persist Action label, skillId, order, enabled and prompt | `pi.plugin.getSettings/setSettings`, `contributes.settings` or plugin-owned UI | Check schema, migration, backup, damaged-config behavior, reset and existing user setting preservation; never silently lose user custom Actions |
| Project/session switch and async races | Composer draft generation / project scope | Prove stale callback refusal, same-session attachment, and no cross-project draft mutation |
| Work Panel settings/standalone UI | `contributes.views` / `ui.view` | Suitable for optional plugin views; an isolated view does **not** automatically get a Composer toolbar API |
| Existing Pi session creation, recovery and permissions | Native APIs | Must be reused, not reimplemented; plugin may not become a new Session/Turn owner |
| Security/trust | `renderer.extension` runs inside renderer realm; `ui.view` uses isolated view | Renderer extension is a **trusted high-impact** integration, not a sandbox. Compare this coupling/risk with a small first-party host UI before choosing |

## 4. Proposed disposable POC (no migration yet)

1. Package a local development plugin with one `composerControl` button and a small `ui.view` page. Explicitly review required permissions and ensure unload removes the button/view.
2. Button prepares the native `/skill:<id>` editable draft. Preserve pre-existing text, active caret, file refs, images and plugin/host marks. Try to reproduce the exact Stage-1 behavior with only declared APIs.
3. Verify the effective available Skill list with both project-specific overrides and disabled/missing Skills. Do not assume `pi.plugin` exposes a native merged Skill Catalog.
4. Prove no model/tool execution until the user presses **Send**. Confirm send-time Skill resolution still follows existing Pi activation and permission checks.
5. Exercise project/session changes while the plugin is active, repeated clicks, stale generation and delayed config lookup; no draft may leak across sessions.
6. Demonstrate action settings round-trip, backup/migration from existing Coding Actions, invalid-file handling, plugin disable/reload and clean removal; never discard existing user data.
7. Run a focused Electron/Host/Pi integration scenario and relevant plugin SDK/renderer tests; record exact versions and observable results. Static documentation review is insufficient.

### Decision gate

- **GO (plugin-owned launcher)** only if all critical draft/data, Catalog, permissions, project/session and user-experience checks pass using existing extension contracts or one small, reviewed additive adapter.
- **PARTIAL** if the plugin can own settings/Matt action definitions but the exact Composer surface must remain a thin first-party UI entry. Keep this hybrid if safer and more stable upstream.
- **NO-GO** if parity requires broad access to private renderer stores, duplicated Skill/Session state, weakened security, or core Composer/Runtime lifecycle changes. Keep the present launcher and document specific missing APIs.

Pluginization is an **implementation option, not an objective by itself**. The actual objectives are low upstream merge conflict, stable developer experience, preserved user data and predictable maintenance.

## 5. Launcher scope

The plugin POC is an optional architecture validation step for the existing launcher. It does not block ordinary Coding Actions. Retain the current launcher unless the parity gate proves that migration preserves behavior and data. This document does not authorize implementation or claim any runtime capability.
