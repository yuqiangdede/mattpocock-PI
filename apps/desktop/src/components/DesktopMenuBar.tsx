import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppMenuCommand, NativeMenuAction } from "@pi-desktop/shared";
import { api } from "../lib/api";

type MenuId = "file" | "edit" | "view" | "window" | "help";

type MenuEntry =
  | { type: "separator" }
  | {
      type: "item";
      label: string;
      accelerator?: string;
      checked?: boolean;
      command?: AppMenuCommand;
      action?: NativeMenuAction;
    };

type DesktopMenuBarProps = {
  sidebarCollapsed: boolean;
  onCommand: (command: AppMenuCommand) => void | Promise<void>;
};

const MENU_IDS: MenuId[] = ["file", "edit", "view", "window", "help"];
const EDITING_ACTIONS = new Set<NativeMenuAction>([
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "selectAll",
]);

export function DesktopMenuBar({
  sidebarCollapsed,
  onCommand,
}: DesktopMenuBarProps) {
  const { t } = useTranslation();
  const platform = window.piDesktop?.platform ?? "darwin";
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [focusedMenu, setFocusedMenu] = useState<MenuId>("file");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef(new Map<MenuId, HTMLButtonElement>());
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const menus = useMemo<Record<MenuId, MenuEntry[]>>(
    () => ({
      file: [
        {
          type: "item",
          label: t("menu.newTask"),
          accelerator: "Ctrl+N",
          command: "newTask",
        },
        {
          type: "item",
          label: t("menu.openProject"),
          accelerator: "Ctrl+O",
          command: "openProject",
        },
        { type: "separator" },
        {
          type: "item",
          label: t("menu.settings"),
          accelerator: "Ctrl+,",
          command: "openSettings",
        },
        { type: "separator" },
        {
          type: "item",
          label: t("menu.closeWindow"),
          accelerator: "Ctrl+W",
          action: "close",
        },
      ],
      edit: [
        {
          type: "item",
          label: t("menu.undo"),
          accelerator: "Ctrl+Z",
          action: "undo",
        },
        {
          type: "item",
          label: t("menu.redo"),
          accelerator: "Ctrl+Y",
          action: "redo",
        },
        { type: "separator" },
        {
          type: "item",
          label: t("menu.cut"),
          accelerator: "Ctrl+X",
          action: "cut",
        },
        {
          type: "item",
          label: t("menu.copy"),
          accelerator: "Ctrl+C",
          action: "copy",
        },
        {
          type: "item",
          label: t("menu.paste"),
          accelerator: "Ctrl+V",
          action: "paste",
        },
        {
          type: "item",
          label: t("menu.selectAll"),
          accelerator: "Ctrl+A",
          action: "selectAll",
        },
      ],
      view: [
        {
          type: "item",
          label: t("menu.search"),
          accelerator: "Ctrl+K",
          command: "openSearch",
        },
        {
          type: "item",
          label: t("menu.commandPalette"),
          accelerator: "Ctrl+Shift+P",
          command: "openCommandPalette",
        },
        {
          type: "item",
          label: t("menu.toggleSidebar"),
          accelerator: "Ctrl+B",
          checked: !sidebarCollapsed,
          command: "toggleSidebar",
        },
        { type: "separator" },
        { type: "item", label: t("menu.reload"), action: "reload" },
        { type: "separator" },
        {
          type: "item",
          label: t("menu.actualSize"),
          accelerator: "Ctrl+0",
          action: "resetZoom",
        },
        {
          type: "item",
          label: t("menu.zoomIn"),
          accelerator: "Ctrl++",
          action: "zoomIn",
        },
        {
          type: "item",
          label: t("menu.zoomOut"),
          accelerator: "Ctrl+-",
          action: "zoomOut",
        },
        { type: "separator" },
        {
          type: "item",
          label: t("menu.toggleFullScreen"),
          accelerator: "F11",
          action: "toggleFullScreen",
        },
      ],
      window: [
        {
          type: "item",
          label: t("window.minimize"),
          action: "minimize",
        },
        {
          type: "item",
          label: t("window.maximize"),
          action: "toggleMaximize",
        },
      ],
      help: [
        {
          type: "item",
          label: t("menu.appHelp"),
          command: "openHelp",
        },
        {
          type: "item",
          label: t("menu.openLogs"),
          command: "openLogs",
        },
        { type: "separator" },
        {
          type: "item",
          label: t("menu.checkForUpdates"),
          command: "checkForUpdates",
        },
      ],
    }),
    [sidebarCollapsed, t],
  );

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        triggerRefs.current.get(openMenu)?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        !rootRef.current?.contains(event.target)
      ) {
        previousFocusRef.current = event.target;
      }
    };
    window.addEventListener("focusin", onFocusIn);
    return () => window.removeEventListener("focusin", onFocusIn);
  }, []);

  useEffect(() => {
    if (platform === "darwin") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "F10" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      event.preventDefault();
      setFocusedMenu("file");
      triggerRefs.current.get("file")?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform]);

  if (platform === "darwin") return null;

  const moveBetweenMenus = (current: MenuId, direction: -1 | 1) => {
    const index = MENU_IDS.indexOf(current);
    const next =
      MENU_IDS[(index + direction + MENU_IDS.length) % MENU_IDS.length];
    setFocusedMenu(next);
    setOpenMenu(openMenu ? next : null);
    triggerRefs.current.get(next)?.focus();
  };

  const onTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    id: MenuId,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveBetweenMenus(id, event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next =
        event.key === "Home" ? MENU_IDS[0] : MENU_IDS[MENU_IDS.length - 1];
      setFocusedMenu(next);
      triggerRefs.current.get(next)?.focus();
      return;
    }
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpenMenu(id);
      requestAnimationFrame(() => {
        const items = Array.from(
          rootRef.current?.querySelectorAll<HTMLButtonElement>(
            `[data-menu="${id}"] .desktop-menu-popover [role^="menuitem"]`,
          ) ?? [],
        );
        items[event.key === "ArrowUp" ? items.length - 1 : 0]?.focus();
      });
    }
  };

  const onMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    id: MenuId,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveBetweenMenus(id, event.key === "ArrowLeft" ? -1 : 1);
      requestAnimationFrame(() => {
        const next = event.key === "ArrowLeft" ? -1 : 1;
        const index = MENU_IDS.indexOf(id);
        const nextId =
          MENU_IDS[(index + next + MENU_IDS.length) % MENU_IDS.length];
        rootRef.current
          ?.querySelector<HTMLButtonElement>(
            `[data-menu="${nextId}"] .desktop-menu-popover [role^="menuitem"]`,
          )
          ?.focus();
      });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[role^="menuitem"]',
        ),
      );
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpenMenu(null);
      triggerRefs.current.get(id)?.focus({ preventScroll: true });
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role^="menuitem"]',
      ),
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    items[(index + delta + items.length) % items.length]?.focus();
  };

  const runEntry = async (entry: Extract<MenuEntry, { type: "item" }>) => {
    setOpenMenu(null);
    if (entry.action && EDITING_ACTIONS.has(entry.action)) {
      const target = previousFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
    if (entry.command) await onCommand(entry.command);
    if (entry.action) await api.nativeMenuAction(entry.action);
  };

  return (
    <div
      ref={rootRef}
      className="desktop-menu-bar no-drag"
      role="menubar"
      aria-label={t("menu.applicationMenu")}
    >
      {MENU_IDS.map((id) => (
        <div
          key={id}
          className="desktop-menu-root"
          data-menu={id}
          role="none"
          onMouseEnter={() => {
            if (!openMenu || openMenu === id) return;
            setFocusedMenu(id);
            setOpenMenu(id);
            requestAnimationFrame(() => {
              rootRef.current
                ?.querySelector<HTMLButtonElement>(
                  `[data-menu="${id}"] .desktop-menu-popover [role^="menuitem"]`,
                )
                ?.focus();
            });
          }}
        >
          <button
            ref={(node) => {
              if (node) triggerRefs.current.set(id, node);
              else triggerRefs.current.delete(id);
            }}
            type="button"
            className={
              openMenu === id
                ? "desktop-menu-trigger active"
                : "desktop-menu-trigger"
            }
            role="menuitem"
            tabIndex={focusedMenu === id ? 0 : -1}
            aria-haspopup="menu"
            aria-expanded={openMenu === id}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() =>
              setOpenMenu((current) => (current === id ? null : id))
            }
            onFocus={() => setFocusedMenu(id)}
            onKeyDown={(event) => onTriggerKeyDown(event, id)}
          >
            {t(`menu.${id}`)}
          </button>
          {openMenu === id ? (
            <div
              className="desktop-menu-popover"
              role="menu"
              aria-label={t(`menu.${id}`)}
              onKeyDown={(event) => onMenuKeyDown(event, id)}
            >
              {menus[id].map((entry, index) =>
                entry.type === "separator" ? (
                  <div
                    key={`separator-${index}`}
                    className="desktop-menu-separator"
                    role="separator"
                  />
                ) : (
                  <button
                    key={`${entry.label}-${index}`}
                    type="button"
                    role={
                      entry.checked === undefined
                        ? "menuitem"
                        : "menuitemcheckbox"
                    }
                    aria-checked={entry.checked}
                    tabIndex={-1}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => void runEntry(entry)}
                  >
                    <span className="desktop-menu-check" aria-hidden>
                      {entry.checked ? <Check size={13} /> : null}
                    </span>
                    <span>{entry.label}</span>
                    {entry.accelerator ? (
                      <kbd>{entry.accelerator}</kbd>
                    ) : null}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
