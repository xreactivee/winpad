import type { App, Win } from "./api";
import { clamp, fold } from "./util";

export type TileType =
  | "start"
  | "apps"
  | "search"
  | "quickSettings"
  | "notifications"
  | "clock"
  | "date"
  | "nextEvent"
  | "media"
  | "volume"
  | "toggles"
  | "language"
  | "battery"
  | "system"
  | "network"
  | "storage"
  | "downloads"
  | "screenshots"
  | "recycleBin"
  | "weather"
  | "dayProgress"
  | "monthProgress"
  | "yearProgress"
  | "pomodoro"
  | "timer"
  | "stopwatch"
  | "screenTime"
  | "claude"
  | "codex";

export type DockItem = { id: string; type: TileType };
export type DockLayout = { items: DockItem[]; pins: string[]; seeded: boolean; version?: number };

export const DOCK_VERSION = 2;

const ADDED_IN_1: TileType[] = ["quickSettings", "notifications"];
const REMOVED_IN_2 = ["tray"];

export const DOCK_HEIGHT = { s: 44, m: 54, l: 64 } as const;
export const DOCK_INSET = 8;
export const DOCK_GAP = 10;

const DEFAULT_TILES: TileType[] = ["start", "apps", "media", "weather", "quickSettings", "battery", "clock", "notifications"];

export const DEFAULT_DOCK: DockLayout = {
  items: DEFAULT_TILES.map((type) => ({ id: `d-${type}`, type })),
  pins: [],
  seeded: false,
};

export function migrate(l: DockLayout): DockLayout {
  const from = l.version ?? 0;
  if (from >= DOCK_VERSION) return l;
  let items = [...l.items];
  if (from < 1) {
    const missing = ADDED_IN_1.filter((type) => !items.some((i) => i.type === type));
    const clock = items.findIndex((i) => i.type === "clock");
    items.splice(clock < 0 ? items.length : clock, 0, ...missing.map((type) => ({ id: `d-${type}`, type })));
  }
  if (from < 2) items = items.filter((i) => !REMOVED_IN_2.includes(i.type));
  return { ...l, items, version: DOCK_VERSION };
}

export const addItem = (l: DockLayout, type: TileType, id: string): DockLayout => ({ ...l, items: [...l.items, { id, type }] });

export const withoutItem = (l: DockLayout, id: string): DockLayout => ({ ...l, items: l.items.filter((i) => i.id !== id) });

function moved<T>(list: T[], from: number, to: number) {
  if (from < 0) return list;
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(clamp(to, 0, out.length), 0, it);
  return out;
}

export const moveItem = (l: DockLayout, id: string, to: number): DockLayout => ({
  ...l,
  items: moved(l.items, l.items.findIndex((i) => i.id === id), to),
});

export const togglePin = (l: DockLayout, appId: string): DockLayout => ({
  ...l,
  pins: l.pins.includes(appId) ? l.pins.filter((p) => p !== appId) : [...l.pins, appId],
});

export const movePin = (l: DockLayout, appId: string, to: number): DockLayout => ({ ...l, pins: moved(l.pins, l.pins.indexOf(appId), to) });

export function pinsFromTaskbar(names: string[], apps: App[]): string[] {
  const byName = new Map(apps.map((a) => [fold(a.name), a.id]));
  return [...new Set(names.map((n) => byName.get(fold(n))).filter((id): id is string => !!id))];
}

export const exeName = (path: string) => (path.split("\\").pop() ?? path).replace(/\.exe$/i, "");

export function appForKey(key: string, apps: App[]): App | undefined {
  const k = key.toLowerCase();
  return apps.find((a) => a.id === key) ?? apps.find((a) => a.target?.toLowerCase() === k);
}

export function appForWindow(w: Win, apps: App[]): App | undefined {
  return (w.appId ? apps.find((a) => a.id === w.appId) : undefined) ?? appForKey(w.exe, apps);
}

export type DockApp = { key: string; name: string; icon: string | null; app: App | null; pinned: boolean; windows: Win[] };

export function dockApps(pins: string[], apps: App[], windows: Win[]): DockApp[] {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const out: DockApp[] = pins.flatMap((id) => {
    const app = byId.get(id);
    return app ? [{ key: id, name: app.name, icon: app.icon, app, pinned: true, windows: [] }] : [];
  });
  for (const w of windows) {
    const app = appForWindow(w, apps);
    const key = app?.id ?? w.appId ?? w.exe.toLowerCase();
    const hit = out.find((d) => d.key === key);
    if (hit) hit.windows.push(w);
    else out.push({ key, name: app?.name ?? (exeName(w.exe) || w.title), icon: app?.icon ?? w.icon, app: app ?? null, pinned: false, windows: [w] });
  }
  return out;
}
