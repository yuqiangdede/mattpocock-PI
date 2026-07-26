import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainSource = await readFile(
  new URL("../electron/main/index.ts", import.meta.url),
  "utf8",
);
const menuSource = await readFile(
  new URL("../electron/main/application-menu.ts", import.meta.url),
  "utf8",
);
const menuBarSource = await readFile(
  new URL("../src/components/DesktopMenuBar.tsx", import.meta.url),
  "utf8",
);
const controlsSource = await readFile(
  new URL("../src/components/WindowControls.tsx", import.meta.url),
  "utf8",
);
const protocolSource = await readFile(
  new URL("../../../packages/shared/src/protocol.ts", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const iconScriptSource = await readFile(
  new URL("../../../scripts/make-icon.py", import.meta.url),
  "utf8",
);

test("macOS installs a standard application menu before window creation", () => {
  assert.match(menuSource, /label:\s*APP_NAME/);
  for (const role of [
    "about",
    "services",
    "hide",
    "hideOthers",
    "unhide",
    "quit",
  ]) {
    assert.match(menuSource, new RegExp(`role: "${role}"`));
  }
  for (const topLevel of ["file", "edit", "view", "window"]) {
    assert.match(menuSource, new RegExp(`label: labels\\.menu\\.${topLevel}`));
  }
  assert.match(menuSource, /role:\s*"help"/);
  assert.match(menuSource, /resolveLocale\(locale\)/);
  assert.match(mainSource, /app\.setName\(APP_NAME\)/);
  assert.match(mainSource, /locale:\s*app\.getLocale\(\)/);
  assert.match(menuSource, /Menu\.buildFromTemplate\(template\)/);
  assert.match(menuSource, /Menu\.setApplicationMenu/);
  assert.match(
    mainSource,
    /installApplicationMenu\(\{\s+locale: app\.getLocale\(\),\s+dispatch: dispatchApplicationMenuCommand,\s+\}\);\s+registerIpc\(\)/,
  );
});

test("application menu routes shell commands and preserves native editing roles", () => {
  for (const accelerator of [
    "CmdOrCtrl+,",
    "CmdOrCtrl+N",
    "CmdOrCtrl+O",
    "CmdOrCtrl+K",
    "CmdOrCtrl+B",
  ]) {
    assert.match(menuSource, new RegExp(accelerator.replace("+", "\\+")));
  }
  for (const role of [
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "selectAll",
    "reload",
    "resetZoom",
    "zoomIn",
    "zoomOut",
    "togglefullscreen",
  ]) {
    assert.match(menuSource, new RegExp(`role: "${role}"`));
  }
  assert.match(mainSource, /IPC\.event\.menuCommand/);
  assert.match(mainSource, /APP_MENU_COMMANDS\.includes\(command\)/);
  assert.doesNotMatch(menuSource, /CmdOrCtrl\+J|toggleWorkPanel/);
  assert.doesNotMatch(menuBarSource, /Ctrl\+J|toggleWorkPanel/);
  assert.doesNotMatch(protocolSource, /"toggleWorkPanel"/);
});

test("Windows and Linux use frameless chrome with accessible menus and controls", () => {
  assert.match(
    mainSource,
    /process\.platform === "darwin"[\s\S]*titleBarStyle:\s*"hiddenInset"[\s\S]*frame:\s*false/,
  );
  assert.match(menuBarSource, /role="menubar"/);
  assert.match(menuBarSource, /role="menu"/);
  assert.match(menuBarSource, /"menuitem"\s*:\s*"menuitemcheckbox"/);
  assert.match(menuBarSource, /event\.key !== "F10"/);
  assert.match(menuBarSource, /event\.shiftKey/);
  assert.match(menuBarSource, /"file", "edit", "view", "window", "help"/);
  assert.match(menuBarSource, /tabIndex=\{focusedMenu === id \? 0 : -1\}/);
  assert.match(menuBarSource, /event\.key === "Home"/);
  assert.match(menuBarSource, /event\.key === "ArrowUp"/);
  assert.match(menuBarSource, /event\.key === "Tab"/);
  assert.match(menuBarSource, /EDITING_ACTIONS\.has\(entry\.action\)/);
  assert.match(menuBarSource, /target\?\.isConnected/);
  assert.match(menuBarSource, /t\("menu\.checkForUpdates"\)/);
  assert.match(menuBarSource, /command:\s*"checkForUpdates"/);
  assert.match(controlsSource, /windowControl\("getState"\)/);
  assert.match(controlsSource, /aria-label=\{t\("window\.minimize"/);
  assert.match(controlsSource, /aria-label=\{t\("window\.close"/);
  assert.match(mainSource, /window\.on\("maximize", sendMaximized\)/);
  assert.match(mainSource, /window\.on\("unmaximize", sendMaximized\)/);
  assert.match(mainSource, /window\.webContents\.isDestroyed\(\)/);
  assert.match(mainSource, /mainWindow = null/);
  assert.match(mainSource, /windowCreationPromise/);
  assert.match(mainSource, /pendingApplicationMenuCommands/);
  assert.match(protocolSource, /menuRendererReady:\s*"pi-desktop\/menu\/rendererReady"/);
  assert.match(mainSource, /waitForMenuRenderer\(window\)/);
  assert.doesNotMatch(
    mainSource.slice(
      mainSource.indexOf("async function deliverApplicationMenuCommand"),
      mainSource.indexOf("function dispatchApplicationMenuCommand"),
    ),
    /setTimeout/,
  );
  assert.match(
    mainSource,
    /PI_DESKTOP_START_MAXIMIZED[\s\S]*window\.maximize\(\)/,
  );
});

test("menu and window IPC reject actions outside their shared allowlists", () => {
  assert.match(protocolSource, /export const APP_MENU_COMMANDS/);
  assert.match(protocolSource, /export const NATIVE_MENU_ACTIONS/);
  assert.match(protocolSource, /export const WINDOW_CONTROL_ACTIONS/);
  assert.match(protocolSource, /nativeMenuAction:\s*"pi-desktop\/menu\/nativeAction"/);
  assert.match(protocolSource, /menuCommand:\s*"pi-desktop\/menu\/event\/command"/);
  assert.match(mainSource, /NATIVE_MENU_ACTIONS\.includes/);
  assert.match(mainSource, /WINDOW_CONTROL_ACTIONS\.includes/);
  assert.match(mainSource, /throw new Error\("unsupported native menu action"\)/);
  assert.match(mainSource, /throw new Error\("unsupported window control action"\)/);

  const windowControlBlock = mainSource.slice(
    mainSource.indexOf("IPC.invoke.windowControl"),
    mainSource.indexOf("IPC.invoke.nativeMenuAction"),
  );
  assert.ok(
    windowControlBlock.indexOf("WINDOW_CONTROL_ACTIONS.includes") <
      windowControlBlock.indexOf("!mainWindow"),
    "window actions must be validated before the no-window return",
  );
});

test("desktop packaging builds the native host before every local target", () => {
  assert.match(
    packageJson.scripts["build:host-release"],
    /cargo build --release .* -p host-core/,
  );
  for (const script of ["pack", "dist", "dist:mac", "dist:win", "dist:linux"]) {
    assert.match(packageJson.scripts[script], /^pnpm run build:host-release/);
  }
  assert.equal(packageJson.build.win.extraResources[0].to, "bin/pi-desktop-host-core.exe");
  assert.equal(packageJson.build.linux.extraResources[0].to, "bin/pi-desktop-host-core");
  assert.equal(packageJson.build.mac.extraResources[0].to, "bin/pi-desktop-host-core");
  assert.match(iconScriptSource, /package_icon = BUILD \/ "icon\.png"/);
  assert.match(iconScriptSource, /shutil\.which\("iconutil"\)/);
});
