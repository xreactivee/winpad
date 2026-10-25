import { Search, X } from "reicon-react";
import type { MouseEvent } from "react";
import { api } from "../../lib/api";
import { openApp, useApps } from "../../lib/apps";
import { dockApps, togglePin, type DockApp } from "../../lib/dock";
import { usePoll } from "../../lib/hooks";
import { AppIcon } from "../../components/AppIcon";
import { openMenu, type MenuItem } from "../../components/ContextMenu";
import { Logo } from "../../components/Logo";
import { useDock, useDockLayout } from "../state";
import { Card, Tile } from "../Tile";

export function StartTile() {
  const { tile } = useDock();
  return (
    <Tile
      label="Start"
      tip
      onClick={() => api.toggleLaunchpad(false)}
      onContextMenu={(e) =>
        openMenu(e, [
          { label: "Dock Settings…", onClick: () => api.openSettings("taskbar") },
          { label: "WinPad Settings…", onClick: () => api.openSettings() },
        ])
      }
    >
      <Logo size={Math.round(tile * 0.66)} />
    </Tile>
  );
}

export function SearchTile() {
  const { tile } = useDock();
  return (
    <Tile label="Search" tip onClick={() => api.toggleLaunchpad(true)}>
      <Search size={Math.round(tile * 0.42)} />
    </Tile>
  );
}

function WindowList({ app }: { app: DockApp }) {
  const dock = useDock();
  return (
    <Card title={app.name}>
      <div style={{ display: "grid", gap: 2 }}>
        {app.windows.map((w) => (
          <div key={w.hwnd} className="list-item row" style={{ gap: 6, padding: "4px 6px 4px 10px" }}>
            <button
              className="ellipsis"
              style={{ flex: 1, textAlign: "left", fontWeight: w.active ? 650 : 500 }}
              onClick={() => {
                void api.windowAction(w.hwnd, "focus");
                dock.close();
              }}
            >
              {w.title}
            </button>
            <button className="icon-button" aria-label="Close window" onClick={() => api.windowAction(w.hwnd, "close")}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AppsTile() {
  const dock = useDock();
  const apps = useApps();
  const [layout, setLayout] = useDockLayout();
  const windows = usePoll(api.listWindows, 1000) ?? [];
  const list = dockApps(layout.pins, apps, windows);
  const size = Math.round(dock.tile * 0.64);

  const click = (d: DockApp, anchor: HTMLElement) => {
    if (!d.windows.length) {
      if (d.app) void openApp(d.app.id);
    } else if (d.windows.length === 1) {
      void api.windowAction(d.windows[0].hwnd, "focus");
    } else {
      dock.toggle(`windows:${d.key}`, anchor, <WindowList app={d} />, 320);
    }
  };

  const menu = (e: MouseEvent, d: DockApp) => {
    const app = d.app;
    const items: MenuItem[] = [];
    if (app) {
      items.push({ label: d.windows.length ? "New Window" : "Open", onClick: () => openApp(app.id) });
      items.push({ label: d.pinned ? "Unpin from Dock" : "Pin to Dock", onClick: () => setLayout((l) => togglePin(l, app.id)) });
      if (app.target) items.push({ label: "Show in Explorer", onClick: () => api.revealApp(app.target) });
    }
    if (d.windows.length) {
      if (items.length) items.push({ separator: true });
      items.push({ label: d.windows.length > 1 ? "Close All Windows" : "Close Window", onClick: () => d.windows.forEach((w) => api.windowAction(w.hwnd, "close")) });
      items.push({ label: "End Task", danger: true, onClick: () => api.windowAction(d.windows[0].hwnd, "endTask") });
    }
    openMenu(e, items);
  };

  return (
    <div className="dock-apps">
      {list.map((d) => (
        <Tile
          key={d.key}
          label={d.name}
          tip
          active={d.windows.some((w) => w.active)}
          style={{ width: dock.tile, padding: 0 }}
          onClick={(anchor) => click(d, anchor)}
          onAuxClick={(e) => e.button === 1 && d.app && void openApp(d.app.id)}
          onContextMenu={(e) => menu(e, d)}
        >
          <AppIcon app={{ id: d.key, name: d.name, target: null, icon: d.icon }} size={size} variant="original" />
          {d.windows.length > 0 && <span className="dock-dot" data-count={Math.min(d.windows.length, 3)} />}
        </Tile>
      ))}
      {!list.length && <span style={{ padding: "0 10px", color: "var(--dock-fg-3)" }}>Pin apps from Launchpad</span>}
    </div>
  );
}
