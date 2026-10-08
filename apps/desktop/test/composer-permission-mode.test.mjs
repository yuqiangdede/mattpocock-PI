import { readComposerSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composerSource = await readComposerSource();

test("unsaved global permissions show Full auto while session and draft choices win", async () => {
  assert.match(composerSource, /settings\?\.defaultPermissionMode \?\? "auto"/);
  assert.match(composerSource, /activeSession\.permissionMode/);
  assert.match(composerSource, /draftConfiguration\.permissionMode/);
  assert.match(composerSource, /sessionPermissionMode === "inherit"/);
  const settingsSource = await readFile(new URL("../src/features/settings/SettingsPage.tsx", import.meta.url), "utf8");
  assert.match(settingsSource, /value=\{settings\.defaultPermissionMode \?\? "auto"\}/);
});

test("Agent and Plan permission menus present only effective selectable modes", () => {
  const permissionControlSource = composerSource.slice(
    composerSource.indexOf('className="composer-permission"'),
    composerSource.indexOf('<div className="composer-right">'),
  );

  assert.match(
    permissionControlSource,
    /\["ask", "accept-edits", "auto"\] as const/,
  );
  assert.match(
    permissionControlSource,
    /aria-checked=\{composerPermissionMode === candidate\}/,
  );
  assert.match(
    permissionControlSource,
    /\{t\(PERMISSION_MODE_I18N_KEYS\[candidate\]\)\}/,
  );
  assert.doesNotMatch(permissionControlSource, /permissionInherit/);
  assert.doesNotMatch(permissionControlSource, /\["inherit",/);
});

test("Goal keeps the permission chip visible but fixes it to Full auto", () => {
  const permissionControlSource = composerSource.slice(
    composerSource.indexOf('className="composer-permission"'),
    composerSource.indexOf('<div className="composer-right">'),
  );

  assert.match(
    composerSource,
    /const composerPermissionMode: Exclude<PermissionMode, "inherit"> =\s*\n\s*mode === "goal" \? "auto" : effectivePermissionMode;/,
  );
  assert.match(permissionControlSource, /mode === "goal" \? undefined : "menu"/);
  assert.match(permissionControlSource, /disabled=\{controlsBlocked \|\| mode === "goal"\}/);
  assert.match(permissionControlSource, /permissionOpen && mode !== "goal"/);
});
