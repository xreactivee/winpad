import { describe, expect, it } from "vitest";
import type { App, Win } from "./api";
import { DEFAULT_DOCK, DOCK_VERSION, addItem, appForKey, dockApps, migrate, moveItem, movePin, pinsFromTaskbar, togglePin, withoutItem, type DockLayout } from "./dock";

const app = (id: string, name = id, target: string | null = null): App => ({ id, name, target, icon: `${id}.png` });
const win = (hwnd: number, exe: string, appId: string | null = null): Win => ({ hwnd, title: `w${hwnd}`, exe, appId, icon: null, active: false, minimized: false });

describe("dock items", () => {
  it("adds, moves and removes items", () => {
    let l = addItem(DEFAULT_DOCK, "screenTime", "x");
    expect(l.items.at(-1)).toEqual({ id: "x", type: "screenTime" });
    l = moveItem(l, "x", 0);
    expect(l.items[0].id).toBe("x");
    l = moveItem(l, "x", 99);
    expect(l.items.at(-1)?.id).toBe("x");
    expect(moveItem(l, "missing", 0)).toEqual(l);
    expect(withoutItem(l, "x").items.some((i) => i.id === "x")).toBe(false);
  });

  it("pins, unpins and reorders apps", () => {
    let l = togglePin(togglePin(DEFAULT_DOCK, "a"), "b");
    expect(l.pins).toEqual(["a", "b"]);
    l = movePin(l, "b", 0);
    expect(l.pins).toEqual(["b", "a"]);
    expect(togglePin(l, "b").pins).toEqual(["a"]);
  });
});

describe("migrate", () => {
  const layout = (types: string[], version?: number) => ({ items: types.map((type, i) => ({ id: `i${i}`, type })), pins: [], seeded: true, version }) as DockLayout;

  it("adds the taskbar tiles once, before the clock", () => {
    const got = migrate(layout(["apps", "clock"]));
    expect(got.items.map((i) => i.type)).toEqual(["apps", "quickSettings", "notifications", "clock"]);
    expect(got.version).toBe(DOCK_VERSION);
    expect(migrate(got)).toBe(got);
  });

  it("keeps tiles the user already has and appends when there is no clock", () => {
    const got = migrate(layout(["quickSettings", "start"]));
    expect(got.items.map((i) => i.type)).toEqual(["quickSettings", "start", "notifications"]);
  });

  it("drops items whose tile no longer exists", () => {
    const got = migrate(layout(["apps", "tray", "clock"], 1));
    expect(got.items.map((i) => i.type)).toEqual(["apps", "clock"]);
    expect(got.version).toBe(DOCK_VERSION);
  });
});

describe("dockApps", () => {
  const apps = [app("Code", "Visual Studio Code", "C:\\VS Code\\Code.exe"), app("Microsoft.Todos!App", "To Do"), app("Chrome", "Chrome", "C:\\Chrome\\chrome.exe")];

  it("keeps pins first and groups windows under their app", () => {
    const got = dockApps(["Chrome", "gone"], apps, [win(1, "C:\\vs code\\code.exe"), win(2, "C:\\Chrome\\chrome.exe"), win(3, "C:\\Chrome\\chrome.exe")]);
    expect(got.map((d) => [d.key, d.pinned, d.windows.map((w) => w.hwnd)])).toEqual([
      ["Chrome", true, [2, 3]],
      ["Code", false, [1]],
    ]);
  });

  it("matches store apps by AUMID and falls back to the exe name", () => {
    const got = dockApps([], apps, [win(4, "C:\\Windows\\ApplicationFrameHost.exe", "Microsoft.Todos!App"), win(5, "D:\\Tools\\portable.exe")]);
    expect(got.map((d) => [d.key, d.name])).toEqual([
      ["Microsoft.Todos!App", "To Do"],
      ["d:\\tools\\portable.exe", "portable"],
    ]);
  });

  it("resolves screen time keys and taskbar pin names", () => {
    expect(appForKey("c:\\chrome\\CHROME.exe", apps)?.id).toBe("Chrome");
    expect(appForKey("Microsoft.Todos!App", apps)?.name).toBe("To Do");
    expect(pinsFromTaskbar(["visual studio code", "Unknown", "Chrome", "Chrome"], apps)).toEqual(["Code", "Chrome"]);
  });
});
