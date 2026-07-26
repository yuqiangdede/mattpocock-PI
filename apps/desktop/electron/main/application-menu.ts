import { Menu, type MenuItemConstructorOptions } from "electron";
import { APP_NAME, type AppMenuCommand } from "@pi-desktop/shared";
import { en, resolveLocale, zhCN } from "@pi-desktop/i18n";

export type ApplicationMenuOptions = {
  platform?: NodeJS.Platform;
  locale?: string;
  dispatch: (command: AppMenuCommand) => void;
};

function appCommand(
  label: string,
  command: AppMenuCommand,
  dispatch: ApplicationMenuOptions["dispatch"],
  accelerator?: string,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => dispatch(command),
  };
}

export function buildApplicationMenuTemplate({
  platform = process.platform,
  locale = "en",
  dispatch,
}: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  const isMac = platform === "darwin";
  const labels = resolveLocale(locale) === "zh-CN" ? zhCN : en;
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: "about" },
        appCommand(labels.menu.checkForUpdates, "checkForUpdates", dispatch),
        { type: "separator" },
        appCommand(
          labels.menu.settings,
          "openSettings",
          dispatch,
          "CmdOrCtrl+,",
        ),
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push(
    {
      label: labels.menu.file,
      submenu: [
        appCommand(labels.menu.newTask, "newTask", dispatch, "CmdOrCtrl+N"),
        appCommand(
          labels.menu.openProject,
          "openProject",
          dispatch,
          "CmdOrCtrl+O",
        ),
        ...(!isMac
          ? ([
              { type: "separator" },
              appCommand(
                labels.menu.settings,
                "openSettings",
                dispatch,
                "CmdOrCtrl+,",
              ),
            ] satisfies MenuItemConstructorOptions[])
          : []),
        { type: "separator" },
        { role: "close", accelerator: "CmdOrCtrl+W" },
      ],
    },
    {
      label: labels.menu.edit,
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? ([
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        { role: "selectAll" },
      ],
    },
    {
      label: labels.menu.view,
      submenu: [
        appCommand(labels.menu.search, "openSearch", dispatch, "CmdOrCtrl+K"),
        appCommand(
          labels.menu.commandPalette,
          "openCommandPalette",
          dispatch,
          "CmdOrCtrl+Shift+P",
        ),
        appCommand(
          labels.menu.toggleSidebar,
          "toggleSidebar",
          dispatch,
          "CmdOrCtrl+B",
        ),
        { type: "separator" },
        { role: "reload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        {
          role: "togglefullscreen",
          ...(isMac ? {} : { accelerator: "F11" }),
        },
      ],
    },
    {
      label: labels.menu.window,
      submenu: [
        { role: "minimize" },
        ...(isMac
          ? ([
              { role: "zoom" },
              { type: "separator" },
              { role: "front" },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      role: "help",
      label: labels.menu.help,
      submenu: [
        appCommand(labels.menu.appHelp, "openHelp", dispatch),
        appCommand(labels.menu.openLogs, "openLogs", dispatch),
        ...(!isMac
          ? ([
              { type: "separator" },
              appCommand(
                labels.menu.checkForUpdates,
                "checkForUpdates",
                dispatch,
              ),
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
  );

  return template;
}

export function installApplicationMenu(options: ApplicationMenuOptions) {
  const template = buildApplicationMenuTemplate(options);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
