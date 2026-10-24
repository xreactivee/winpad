import { clamp, fold, uid } from "./util";

export type WidgetSize = "s" | "m" | "l";
export type Pin = { col: number; row: number };
export type AppItem = { kind: "app"; id: string; pin?: Pin };
export type SubFolder = { kind: "folder"; id: string; name: string; apps: string[] };
export type FolderEntry = string | SubFolder;
export type FolderItem = { kind: "folder"; id: string; name: string; apps: FolderEntry[]; pin?: Pin };
export type WidgetItem = { kind: "widget"; id: string; pin?: Pin };
export type Item = AppItem | FolderItem | WidgetItem;
export type Layout = { pages: Item[][]; hidden: string[]; categories: Record<string, string> };
export type Loc = { page: number; index: number };
export type Cell = { col: number; row: number; w: number; h: number };
export type Size = { w: number; h: number };
export type Dims = (it: Item) => Size;

export function sizeCells(size: WidgetSize): Size {
  return size === "l" ? { w: 4, h: 4 } : size === "m" ? { w: 4, h: 2 } : { w: 2, h: 2 };
}

type Spec = Size & { pin?: Pin };
export const specs = (items: Item[], dims: Dims): Spec[] => items.map((it) => ({ ...dims(it), pin: it.pin }));

export function packPage(sizes: Spec[], cols: number, rows: number): (Cell | undefined)[] {
  const used = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const free = (c: number, r: number, w: number, h: number) => {
    if (c < 0 || r < 0 || c + w > cols || r + h > rows) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (used[y][x]) return false;
    return true;
  };
  const take = (c: Cell) => {
    for (let y = c.row; y < c.row + c.h; y++) for (let x = c.col; x < c.col + c.w; x++) used[y][x] = true;
  };
  const cells: (Cell | undefined)[] = [];
  const size = (s: Spec) => ({ w: Math.min(s.w, cols), h: Math.min(s.h, rows) });
  sizes.forEach((s, i) => {
    const { w, h } = size(s);
    if (s.pin && free(s.pin.col, s.pin.row, w, h)) take((cells[i] = { col: s.pin.col, row: s.pin.row, w, h }));
  });
  let full = false;
  sizes.forEach((s, i) => {
    if (cells[i] || full) return;
    const { w, h } = size(s);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (free(c, r, w, h)) {
          take((cells[i] = { col: c, row: r, w, h }));
          return;
        }
    if (!s.pin) full = true;
  });
  return cells;
}

export function paginate(pages: Item[][], dims: Dims, cols: number, rows: number): Item[][] {
  const out: Item[][] = [];
  let carry: Item[] = [];
  for (let i = 0; i < pages.length || carry.length; i++) {
    const page = [...carry, ...(pages[i] ?? [])];
    const cells = packPage(specs(page, dims), cols, rows);
    let keep = page.filter((_, j) => cells[j]);
    carry = page.filter((_, j) => !cells[j]);
    if (!keep.length && carry.length) {
      keep = [carry[0]];
      carry = carry.slice(1);
    }
    if (keep.length) out.push(keep);
  }
  return out.length ? out : [[]];
}

export const entryId = (e: FolderEntry) => (typeof e === "string" ? e : e.id);
const folderApps = (f: { apps: FolderEntry[] }) => f.apps.flatMap((e) => (typeof e === "string" ? [e] : e.apps));
export const isFlat = (f: { apps: FolderEntry[] }): f is { apps: string[] } => f.apps.every((e) => typeof e === "string");

export const toItem = (e: FolderEntry): Item => (typeof e === "string" ? { kind: "app", id: e } : { ...e, apps: [...e.apps] });

function keepApps(pages: Item[][], keep: (id: string) => boolean): Item[][] {
  return pages.map((page) =>
    page.flatMap((it): Item[] => {
      if (it.kind === "widget") return [it];
      if (it.kind === "app") return keep(it.id) ? [it] : [];
      const apps = it.apps.flatMap((e): FolderEntry[] => {
        if (typeof e === "string") return keep(e) ? [e] : [];
        const sub = e.apps.filter(keep);
        return sub.length ? [{ ...e, apps: sub }] : [];
      });
      return apps.length ? [{ ...it, apps }] : [];
    }),
  );
}

function allAppIds(layout: Layout): Set<string> {
  const ids = new Set(layout.hidden);
  for (const page of layout.pages)
    for (const it of page) {
      if (it.kind === "app") ids.add(it.id);
      if (it.kind === "folder") folderApps(it).forEach((a) => ids.add(a));
    }
  return ids;
}

export function syncApps(layout: Layout, installed: string[]): Layout {
  const have = new Set(installed);
  const known = allAppIds(layout);
  const pages = keepApps(layout.pages, (id) => have.has(id));
  const fresh = installed.filter((id) => !known.has(id)).map((id): Item => ({ kind: "app", id }));
  if (fresh.length) {
    if (!pages.length) pages.push([]);
    pages[pages.length - 1] = [...pages[pages.length - 1], ...fresh];
  }
  return { ...layout, pages, hidden: layout.hidden.filter((id) => have.has(id)) };
}

export function initialLayout(appIds: string[], widgetIds: string[]): Layout {
  return {
    pages: [[...widgetIds.map((id): Item => ({ kind: "widget", id })), ...appIds.map((id): Item => ({ kind: "app", id }))]],
    hidden: [],
    categories: {},
  };
}

const clonePages = (l: Layout) => l.pages.map((p) => [...p]);

function insertAt(pages: Item[][], loc: Loc, item: Item) {
  while (pages.length <= loc.page) pages.push([]);
  const page = pages[loc.page];
  page.splice(Math.max(0, Math.min(loc.index, page.length)), 0, item);
}

export function moveItem(layout: Layout, from: Loc, to: Loc): Layout {
  const pages = clonePages(layout);
  const [item] = pages[from.page]?.splice(from.index, 1) ?? [];
  if (!item) return layout;
  const index = from.page === to.page && to.index > from.index ? to.index - 1 : to.index;
  insertAt(pages, { page: to.page, index }, item);
  return { ...layout, pages };
}

export function createFolder(layout: Layout, from: Loc, onto: Loc, name: string, id = uid("f")): Layout {
  const a = layout.pages[from.page]?.[from.index];
  const b = layout.pages[onto.page]?.[onto.index];
  if (!a || !b || a.kind !== "app" || b.kind !== "app" || a === b) return layout;
  const pages = clonePages(layout);
  pages[onto.page][onto.index] = { kind: "folder", id, name, apps: [b.id, a.id], ...(b.pin && { pin: b.pin }) };
  pages[from.page].splice(from.index, 1);
  return { ...layout, pages };
}

export function addToFolder(layout: Layout, from: Loc, folder: Loc): Layout {
  const a = layout.pages[from.page]?.[from.index];
  const f = layout.pages[folder.page]?.[folder.index];
  if (!a || !f || f.kind !== "folder" || a === f) return layout;
  let entry: FolderEntry;
  if (a.kind === "app") entry = a.id;
  else if (a.kind === "folder" && isFlat(a)) entry = { kind: "folder", id: a.id, name: a.name, apps: a.apps };
  else return layout;
  const pages = clonePages(layout);
  pages[folder.page][folder.index] = { ...f, apps: [...f.apps, entry] };
  pages[from.page].splice(from.index, 1);
  return { ...layout, pages };
}

type Where = { loc: Loc; sub?: number };

function whereIs(layout: Layout, id: string): Where | null {
  for (let p = 0; p < layout.pages.length; p++)
    for (let i = 0; i < layout.pages[p].length; i++) {
      const it = layout.pages[p][i];
      if (it.kind !== "folder") continue;
      if (it.id === id) return { loc: { page: p, index: i } };
      const sub = it.apps.findIndex((e) => typeof e !== "string" && e.id === id);
      if (sub >= 0) return { loc: { page: p, index: i }, sub };
    }
  return null;
}

function editEntries(layout: Layout, id: string, fn: (entries: FolderEntry[]) => FolderEntry[], name?: string): Layout {
  const w = whereIs(layout, id);
  if (!w) return layout;
  const pages = clonePages(layout);
  const top = pages[w.loc.page][w.loc.index] as FolderItem;
  let entries: FolderEntry[];
  let topName = top.name;
  if (w.sub === undefined) {
    entries = fn(top.apps);
    topName = name ?? top.name;
  } else {
    const sub = top.apps[w.sub] as SubFolder;
    const apps = fn(sub.apps).filter((e): e is string => typeof e === "string");
    entries = apps.length ? top.apps.map((e, k) => (k === w.sub ? { ...sub, name: name ?? sub.name, apps } : e)) : top.apps.filter((_, k) => k !== w.sub);
  }
  if (entries.length) pages[w.loc.page][w.loc.index] = { ...top, name: topName, apps: entries };
  else pages[w.loc.page].splice(w.loc.index, 1);
  return { ...layout, pages };
}

export function removeFromFolder(layout: Layout, folderId: string, id: string, to?: Loc): Layout {
  const w = whereIs(layout, folderId);
  if (!w) return layout;
  const top = layout.pages[w.loc.page][w.loc.index] as FolderItem;
  const list = w.sub === undefined ? top.apps : (top.apps[w.sub] as SubFolder).apps;
  const entry = list.find((e) => entryId(e) === id);
  if (!entry) return layout;
  const out = editEntries(layout, folderId, (es) => es.filter((e) => entryId(e) !== id));
  const stays = out.pages[w.loc.page][w.loc.index]?.id === top.id;
  insertAt(out.pages, to ?? { page: w.loc.page, index: w.loc.index + (stays ? 1 : 0) }, toItem(entry));
  return out;
}

export function mergeInFolder(layout: Layout, folderId: string, aId: string, ontoId: string, name: string, id = uid("f")): Layout {
  if (whereIs(layout, folderId)?.sub !== undefined || aId === ontoId) return layout;
  return editEntries(layout, folderId, (es) => {
    const onto = es.find((e) => entryId(e) === ontoId);
    if (!onto || !es.includes(aId)) return es;
    return es
      .filter((e) => e !== aId)
      .map((e) => (e !== onto ? e : typeof onto === "string" ? { kind: "folder", id, name, apps: [onto, aId] } : { ...onto, apps: [...onto.apps, aId] }));
  });
}

export function dissolveFolder(layout: Layout, id: string): Layout {
  const w = whereIs(layout, id);
  if (!w) return layout;
  const pages = clonePages(layout);
  const top = pages[w.loc.page][w.loc.index] as FolderItem;
  if (w.sub === undefined) pages[w.loc.page].splice(w.loc.index, 1, ...top.apps.map(toItem));
  else pages[w.loc.page][w.loc.index] = { ...top, apps: top.apps.flatMap((e, k) => (k === w.sub && typeof e !== "string" ? e.apps : [e])) };
  return { ...layout, pages };
}

export function setPin(layout: Layout, loc: Loc, pin: Pin | null): Layout {
  const it = layout.pages[loc.page]?.[loc.index];
  if (!it) return layout;
  const pages = clonePages(layout);
  const { pin: _, ...rest } = it;
  pages[loc.page][loc.index] = pin ? { ...rest, pin } : rest;
  return { ...layout, pages };
}

export function moveEntry(list: FolderEntry[], id: string, to: number): FolderEntry[] {
  const from = list.findIndex((e) => entryId(e) === id);
  if (from < 0) return list;
  const out = [...list];
  const [entry] = out.splice(from, 1);
  out.splice(to, 0, entry);
  return out;
}

export function updateFolder(layout: Layout, folderId: string, patch: { name?: string; apps?: FolderEntry[] }): Layout {
  return editEntries(layout, folderId, (es) => patch.apps ?? es, patch.name);
}

export function hideApp(layout: Layout, appId: string): Layout {
  if (layout.hidden.includes(appId)) return layout;
  return { ...layout, pages: keepApps(layout.pages, (id) => id !== appId), hidden: [...layout.hidden, appId] };
}

export function unhideApp(layout: Layout, appId: string): Layout {
  const pages = clonePages(layout);
  pages[pages.length - 1].push({ kind: "app", id: appId });
  return { ...layout, pages, hidden: layout.hidden.filter((a) => a !== appId) };
}

export function addWidget(layout: Layout, widgetId: string, page: number): Layout {
  const pages = clonePages(layout);
  insertAt(pages, { page, index: 0 }, { kind: "widget", id: widgetId });
  return { ...layout, pages };
}

export function matchApps<T extends { name: string }>(apps: T[], query: string): T[] {
  const q = fold(query.trim());
  if (!q) return [];
  const rank = (name: string) => {
    const n = fold(name);
    if (n.startsWith(q)) return 0;
    if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return apps
    .map((a) => ({ a, r: rank(a.name) }))
    .filter((x) => x.r >= 0)
    .sort((x, y) => x.r - y.r || x.a.name.localeCompare(y.a.name, "tr"))
    .map((x) => x.a);
}

export function stepSelection(sel: number, key: string, apps: number, files: number, cols: number): number {
  const inApps = sel < apps;
  const next =
    key === "ArrowRight" ? sel + 1
    : key === "ArrowLeft" ? sel - 1
    : key === "ArrowDown" ? (inApps ? Math.min(sel + cols, apps) : sel + 1)
    : key === "ArrowUp" ? (inApps ? sel - cols : sel === apps ? apps - 1 : sel - 1)
    : sel;
  return clamp(next, 0, Math.max(0, apps + files - 1));
}
