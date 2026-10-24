import { describe, expect, it } from "vitest";
import {
  addToFolder,
  createFolder,
  dissolveFolder,
  hideApp,
  matchApps,
  mergeInFolder,
  moveEntry,
  moveItem,
  packPage,
  paginate,
  removeFromFolder,
  setPin,
  stepSelection,
  syncApps,
  updateFolder,
  unhideApp,
  type Item,
  type Layout,
} from "./layout";

const app = (id: string): Item => ({ kind: "app", id });
const widget = (id: string): Item => ({ kind: "widget", id });
const L = (pages: Item[][], hidden: string[] = []): Layout => ({ pages, hidden, categories: {} });
const one = () => ({ w: 1, h: 1 });

describe("packPage", () => {
  it("places a 2x2 widget top-left and flows icons around it", () => {
    const cells = packPage([{ w: 2, h: 2 }, one(), one(), one()], 4, 3);
    expect(cells).toEqual([
      { col: 0, row: 0, w: 2, h: 2 },
      { col: 2, row: 0, w: 1, h: 1 },
      { col: 3, row: 0, w: 1, h: 1 },
      { col: 2, row: 1, w: 1, h: 1 },
    ]);
  });

  it("stops at the first item that does not fit", () => {
    const cells = packPage([one(), one(), one(), { w: 2, h: 2 }, one()], 2, 2);
    expect(cells).toHaveLength(3);
  });

  it("puts the video's orb top-right when it follows three apps", () => {
    const cells = packPage([{ w: 2, h: 2 }, one(), one(), one(), { w: 2, h: 2 }], 7, 5);
    expect(cells[4]).toEqual({ col: 5, row: 0, w: 2, h: 2 });
  });

  it("keeps locked items in their cell and flows the rest around them", () => {
    const cells = packPage([one(), { w: 1, h: 1, pin: { col: 0, row: 0 } }, one()], 2, 2);
    expect(cells).toEqual([
      { col: 1, row: 0, w: 1, h: 1 },
      { col: 0, row: 0, w: 1, h: 1 },
      { col: 0, row: 1, w: 1, h: 1 },
    ]);
  });

  it("falls back to flowing a lock whose cell is off the grid", () => {
    expect(packPage([{ w: 1, h: 1, pin: { col: 9, row: 9 } }], 2, 2)).toEqual([{ col: 0, row: 0, w: 1, h: 1 }]);
  });
});

describe("paginate", () => {
  const dims = (it: Item) => (it.kind === "widget" ? { w: 2, h: 2 } : { w: 1, h: 1 });

  it("spills overflow to the next page and keeps order", () => {
    const items = ["a", "b", "c", "d", "e"].map(app);
    expect(paginate([items], dims, 2, 2)).toEqual([items.slice(0, 4), items.slice(4)]);
  });

  it("drops empty pages but keeps at least one", () => {
    expect(paginate([[], [app("a")], []], dims, 2, 2)).toEqual([[app("a")]]);
    expect(paginate([[]], dims, 2, 2)).toEqual([[]]);
  });

  it("gives an item bigger than the grid its own page instead of looping", () => {
    expect(paginate([[widget("w"), app("a")]], dims, 1, 1)).toEqual([[widget("w")], [app("a")]]);
  });

  it("never pushes a locked item to the next page", () => {
    const locked: Item = { kind: "app", id: "z", pin: { col: 1, row: 1 } };
    const out = paginate([[...["a", "b", "c", "d"].map(app), locked]], dims, 2, 2);
    expect(out[0]).toContain(locked);
    expect(out[1]).toEqual([app("d")]);
  });

  it("locks and unlocks items", () => {
    const l = setPin(L([[app("a"), app("b")]]), { page: 0, index: 1 }, { col: 1, row: 1 });
    expect(l.pages[0][1]).toEqual({ kind: "app", id: "b", pin: { col: 1, row: 1 } });
    expect(setPin(l, { page: 0, index: 1 }, null).pages[0][1]).toEqual(app("b"));
  });

  it("is idempotent", () => {
    const pages = [[widget("w"), ...["a", "b", "c", "d", "e", "f"].map(app)]];
    const once = paginate(pages, dims, 3, 3);
    expect(paginate(once, dims, 3, 3)).toEqual(once);
  });
});

describe("syncApps", () => {
  it("removes uninstalled apps, empties folders, appends new apps to the last page", () => {
    const l = L([[app("a"), { kind: "folder", id: "f", name: "F", apps: ["gone"] }], [app("b")]], ["gone2"]);
    const s = syncApps(l, ["a", "b", "new"]);
    expect(s.pages).toEqual([[app("a")], [app("b"), app("new")]]);
    expect(s.hidden).toEqual([]);
  });

  it("does not re-add hidden apps", () => {
    const s = syncApps(L([[app("a")]], ["h"]), ["a", "h"]);
    expect(s.pages).toEqual([[app("a")]]);
    expect(s.hidden).toEqual(["h"]);
  });
});

describe("folders and moves", () => {
  it("dropping an app onto an app makes a folder in the target's place", () => {
    const l = createFolder(L([[app("a"), app("b"), app("c")]]), { page: 0, index: 2 }, { page: 0, index: 0 }, "Sosyal", "f1");
    expect(l.pages[0]).toEqual([{ kind: "folder", id: "f1", name: "Sosyal", apps: ["a", "c"] }, app("b")]);
  });

  it("adds to and drags out of a folder; the last app out removes the folder", () => {
    let l = L([[{ kind: "folder", id: "f", name: "F", apps: ["a"] }, app("b")]]);
    l = addToFolder(l, { page: 0, index: 1 }, { page: 0, index: 0 });
    expect(l.pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["a", "b"] }]);
    l = removeFromFolder(l, "f", "a");
    expect(l.pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["b"] }, app("a")]);
    l = removeFromFolder(l, "f", "b", { page: 0, index: 0 });
    expect(l.pages[0]).toEqual([app("b"), app("a")]);
  });

  it("moves within a page and across pages", () => {
    const l = L([[app("a"), app("b"), app("c")], [app("d")]]);
    expect(moveItem(l, { page: 0, index: 0 }, { page: 0, index: 3 }).pages[0]).toEqual([app("b"), app("c"), app("a")]);
    expect(moveItem(l, { page: 0, index: 2 }, { page: 0, index: 0 }).pages[0]).toEqual([app("c"), app("a"), app("b")]);
    expect(moveItem(l, { page: 1, index: 0 }, { page: 0, index: 1 }).pages).toEqual([[app("a"), app("d"), app("b"), app("c")], []]);
  });

  it("reorders entries inside a folder", () => {
    const sub = { kind: "folder" as const, id: "s", name: "S", apps: ["x"] };
    expect(moveEntry(["a", sub, "b"], "a", 2)).toEqual([sub, "b", "a"]);
    expect(moveEntry(["a", sub], "s", 0)).toEqual([sub, "a"]);
    expect(moveEntry(["a"], "missing", 0)).toEqual(["a"]);
  });

  it("nests a folder in a folder, but never three levels deep", () => {
    const inner: Item = { kind: "folder", id: "s", name: "S", apps: ["x", "y"] };
    let l = L([[{ kind: "folder", id: "f", name: "F", apps: ["a"] }, inner]]);
    l = addToFolder(l, { page: 0, index: 1 }, { page: 0, index: 0 });
    expect(l.pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["a", inner] }]);
    const deep = L([[{ kind: "folder", id: "g", name: "G", apps: [] }, l.pages[0][0]]]);
    expect(addToFolder(deep, { page: 0, index: 1 }, { page: 0, index: 0 })).toBe(deep);
  });

  it("makes and fills subfolders inside a folder; a subfolder can't nest further", () => {
    let l = L([[{ kind: "folder", id: "f", name: "F", apps: ["a", "b", "c"] }]]);
    l = mergeInFolder(l, "f", "b", "a", "Alt", "s");
    expect(l.pages[0][0]).toEqual({ kind: "folder", id: "f", name: "F", apps: [{ kind: "folder", id: "s", name: "Alt", apps: ["a", "b"] }, "c"] });
    l = mergeInFolder(l, "f", "c", "s", "x");
    expect(l.pages[0][0]).toEqual({ kind: "folder", id: "f", name: "F", apps: [{ kind: "folder", id: "s", name: "Alt", apps: ["a", "b", "c"] }] });
    expect(mergeInFolder(l, "s", "a", "b", "x")).toBe(l);
  });

  it("renames, reorders and empties subfolders; empty ones disappear", () => {
    const sub = { kind: "folder" as const, id: "s", name: "S", apps: ["x", "y"] };
    let l = L([[{ kind: "folder", id: "f", name: "F", apps: ["a", sub] }]]);
    l = updateFolder(l, "s", { name: "T", apps: ["y", "x"] });
    expect(l.pages[0][0]).toEqual({ kind: "folder", id: "f", name: "F", apps: ["a", { ...sub, name: "T", apps: ["y", "x"] }] });
    l = removeFromFolder(l, "s", "y");
    l = removeFromFolder(l, "s", "x");
    expect(l.pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["a"] }, app("x"), app("y")]);
  });

  it("drags a subfolder out to the grid and dissolves folders in place", () => {
    const sub = { kind: "folder" as const, id: "s", name: "S", apps: ["x"] };
    const l = L([[{ kind: "folder", id: "f", name: "F", apps: ["a", sub] }]]);
    expect(removeFromFolder(l, "f", "s").pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["a"] }, sub]);
    expect(dissolveFolder(l, "s").pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["a", "x"] }]);
    expect(dissolveFolder(l, "f").pages[0]).toEqual([app("a"), sub]);
  });

  it("syncs and hides apps inside subfolders", () => {
    const l = L([[{ kind: "folder", id: "f", name: "F", apps: ["a", { kind: "folder", id: "s", name: "S", apps: ["x"] }] }]]);
    expect(syncApps(l, ["a"]).pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["a"] }]);
    expect(hideApp(l, "x").pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["a"] }]);
  });

  it("hides from inside folders and unhides onto the last page", () => {
    let l = L([[{ kind: "folder", id: "f", name: "F", apps: ["a", "b"] }], [app("c")]]);
    l = hideApp(l, "a");
    expect(l.pages[0]).toEqual([{ kind: "folder", id: "f", name: "F", apps: ["b"] }]);
    expect(l.hidden).toEqual(["a"]);
    l = unhideApp(l, "a");
    expect(l.pages[1]).toEqual([app("c"), app("a")]);
    expect(l.hidden).toEqual([]);
  });
});

describe("matchApps", () => {
  const apps = ["İnternet Explorer", "Visual Studio Code", "Hesap Makinesi", "Discord", "Code Writer", "Ayarlar"].map((name) => ({ name }));

  it("ranks prefix, then word start, then substring", () => {
    expect(matchApps(apps, "code").map((a) => a.name)).toEqual(["Code Writer", "Visual Studio Code"]);
    expect(matchApps(apps, "ar").map((a) => a.name)).toEqual(["Ayarlar"]);
  });

  it("is Turkish case and dotless-i aware", () => {
    expect(matchApps(apps, "internet").map((a) => a.name)).toEqual(["İnternet Explorer"]);
    expect(matchApps(apps, "HESAP").map((a) => a.name)).toEqual(["Hesap Makinesi"]);
  });

  it("returns nothing for an empty query", () => {
    expect(matchApps(apps, "  ")).toEqual([]);
  });
});

describe("stepSelection", () => {
  it("moves through the app grid by rows and columns", () => {
    expect(stepSelection(1, "ArrowDown", 10, 0, 4)).toBe(5);
    expect(stepSelection(9, "ArrowDown", 10, 0, 4)).toBe(9);
    expect(stepSelection(2, "ArrowUp", 10, 0, 4)).toBe(0);
    expect(stepSelection(0, "ArrowLeft", 10, 0, 4)).toBe(0);
  });

  it("drops from the last app row into the file list and back", () => {
    expect(stepSelection(7, "ArrowDown", 10, 3, 4)).toBe(10);
    expect(stepSelection(10, "ArrowDown", 10, 3, 4)).toBe(11);
    expect(stepSelection(12, "ArrowDown", 10, 3, 4)).toBe(12);
    expect(stepSelection(10, "ArrowUp", 10, 3, 4)).toBe(9);
    expect(stepSelection(0, "ArrowDown", 0, 3, 4)).toBe(1);
    expect(stepSelection(0, "ArrowUp", 0, 3, 4)).toBe(0);
  });
});
