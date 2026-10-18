import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { Plus } from "lucide-react";
import { api, currentWindow, listen, type App, type PowerAction } from "../lib/api";
import { openApp, refreshApps, useApps, useHistory } from "../lib/apps";
import { CATEGORIES, categorize, categoryName, libraryGroups } from "../lib/categories";
import {
  addToFolder,
  addWidget,
  createFolder,
  dissolveFolder,
  hideApp,
  initialLayout,
  isFlat,
  matchApps,
  mergeInFolder,
  moveItem,
  packPage,
  paginate,
  removeFromFolder,
  setPin,
  sizeCells,
  specs,
  syncApps,
  toItem,
  unhideApp,
  updateFolder,
  type Dims,
  type FolderEntry,
  type FolderItem,
  type Item,
  type Layout,
  type Loc,
  type SubFolder,
} from "../lib/layout";
import { useSetting, useSettings } from "../lib/settings";
import { useStored } from "../lib/store";
import { byId as mapById, clamp } from "../lib/util";
import { frosted, useWallpaper } from "../lib/wallpaper";
import { AppIcon } from "../components/AppIcon";
import { AppTile } from "../components/AppTile";
import { Backdrop } from "../components/Backdrop";
import { openMenu, type MenuItem } from "../components/ContextMenu";
import { Dots } from "../components/Dots";
import { Glass } from "../components/Glass";
import { Modal } from "../components/Modal";
import { SIZE_LABEL, useWidgets, withoutWidget, type Options, type WidgetInstance } from "../widgets/registry";
import { WidgetEditor } from "../widgets/WidgetEditor";
import { WidgetFrame } from "../widgets/WidgetFrame";
import { WidgetGallery } from "../widgets/WidgetGallery";
import { AppLibrary, CategoryView } from "./AppLibrary";
import { AppWindow, WINDOW_H } from "./AppWindow";
import { FolderIcon, FolderPanel, folderPreview } from "./Folder";
import { Grid, itemKey, metrics, type Metrics } from "./Grid";
import { PHONE_PANEL_W, PhonePanel, PhoneToggle } from "./PhonePanel";
import { PowerButton } from "./PowerButton";
import { SearchBar } from "./SearchBar";

type Phase = "opening" | "open" | "closing" | "closed";
type Target = { index: number; merge: boolean };
type Drag = { item: Item; from: Loc | null; folderId?: string; x: number; y: number; target: Target | null };

const FIRST_RUN_WIDGETS = ["lp-calendar", "lp-orb", "lp-clock"];
const EMPTY: Layout = { pages: [], hidden: [], categories: {} };

function firstRunLayout(appIds: string[]): Layout {
  const l = initialLayout(appIds, []);
  const apps = l.pages[0];
  const w = (id: string): Item => ({ kind: "widget", id });
  l.pages[0] = [w(FIRST_RUN_WIDGETS[0]), ...apps.slice(0, 3), w(FIRST_RUN_WIDGETS[1]), ...apps.slice(3, 9), w(FIRST_RUN_WIDGETS[2]), ...apps.slice(9)];
  return l;
}

function targetAt(x: number, y: number, items: Item[], dims: Dims, m: Metrics, dragged: Item): Target {
  const gx = x - m.padX;
  const gy = y - m.top;
  const col = Math.floor(gx / m.cellW);
  const row = Math.floor(gy / m.cellH);
  const cells = packPage(specs(items, dims), m.cols, m.rows);
  if (col < 0 || row < 0 || col >= m.cols || row >= m.rows) return { index: items.length, merge: false };
  const i = cells.findIndex((c) => c && col >= c.col && col < c.col + c.w && row >= c.row && row < c.row + c.h);
  if (i >= 0) {
    const it = items[i];
    const c = cells[i]!;
    const near = Math.hypot(gx - (c.col + 0.5) * m.cellW, gy - (c.row * m.cellH + m.cellH * 0.42)) < m.icon * 0.42;
    const merge =
      near &&
      c.w === 1 &&
      it !== dragged &&
      !(it.kind === "app" && it.pin) &&
      (dragged.kind === "app" ? it.kind === "app" || it.kind === "folder" : dragged.kind === "folder" && isFlat(dragged) && it.kind === "folder");
    if (merge || !it.pin) return { index: i, merge };
  }
  const pos = row * m.cols + col;
  const after = cells.findIndex((c, j) => c && !items[j].pin && c.row * m.cols + c.col > pos);
  return { index: after < 0 ? items.length : after, merge: false };
}

const reorderIndex = (from: Loc, page: number, index: number) => (from.page === page && from.index < index ? index + 1 : index);

export function Launchpad() {
  const [settings] = useSettings();
  const [, setPhoneMode] = useSetting("phonePanel");
  const apps = useApps();
  const byId = useMemo(() => mapById(apps), [apps]);
  const wallpaper = useWallpaper();
  const [layout, setLayout, layoutReady] = useStored<Layout | null>("layout", null);
  const [widgets, setWidgets] = useWidgets();
  const [history] = useHistory();
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  const [phase, setPhase] = useState<Phase>(currentWindow ? "closed" : "open");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [editing, setEditing] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const [editWidget, setEditWidget] = useState<string | null>(null);
  const [catFor, setCatFor] = useState<App | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { gridCols: cols, gridRows: rows, homeView: view, phonePanel: phoneMode } = settings;
  const phoneSide = phoneMode === "open" && view !== "window" ? PHONE_PANEL_W + 40 : 0;
  const m = metrics(size.w - phoneSide, size.h, cols, rows);
  const dims = useCallback<Dims>((it) => (it.kind === "widget" ? sizeCells(widgets[it.id]?.size ?? "s") : { w: 1, h: 1 }), [widgets]);

  useEffect(() => {
    if (layoutReady && layout === null && apps.length) setLayout(firstRunLayout(apps.map((a) => a.id)));
  }, [layoutReady, layout, apps, setLayout]);

  const norm = useMemo<Layout | null>(() => {
    if (!layout) return null;
    const synced = apps.length ? syncApps(layout, apps.map((a) => a.id)) : layout;
    const valid = (id: string) => !!widgets[id]?.enabled;
    let pages = synced.pages.map((p) => p.filter((it) => it.kind !== "widget" || valid(it.id)));
    const present = new Set(pages.flat().filter((it) => it.kind === "widget").map((it) => it.id));
    const missing = Object.values(widgets).filter((w) => valid(w.id) && !present.has(w.id));
    if (missing.length) pages = [[...missing.map((w): Item => ({ kind: "widget", id: w.id })), ...(pages[0] ?? [])], ...pages.slice(1)];
    return { ...synced, pages: paginate(pages, dims, cols, rows) };
  }, [layout, apps, widgets, dims, cols, rows]);

  useEffect(() => {
    if (norm && layout && JSON.stringify(norm) !== JSON.stringify(layout)) setLayout(norm);
  }, [norm, layout, setLayout]);

  const pages = norm?.pages ?? [[]];
  const library = view === "library";
  const paged = view === "pages";
  const lastPage = paged ? pages.length - 1 : 0;
  const curPage = Math.min(page, lastPage);

  const modalOpen = useRef(false);
  modalOpen.current = gallery || !!editWidget || !!catFor;
  const close = useCallback(() => setPhase((p) => (p === "open" ? "closing" : p)), []);
  const openedAt = useRef(0);

  useEffect(() => {
    const offOpen = listen("launchpad-open", () => {
      openedAt.current = Date.now();
      setPhase("opening");
      setPage(0);
      void refreshApps();
    });
    const offClose = listen("launchpad-close", close);
    const onResize = () => setSize({ w: innerWidth, h: innerHeight });
    const onBlur = () => !modalOpen.current && Date.now() - openedAt.current > 800 && close();
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onBlur);
    return () => {
      offOpen();
      offClose();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onBlur);
    };
  }, [close]);

  useEffect(() => {
    if (phase !== "opening") return;
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => setPhase("open"))));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") return;
    const t = setTimeout(() => {
      setPhase("closed");
      setQuery("");
      setEditing(false);
      setFolder(null);
      setSub(null);
      setCategory(null);
      setDrag(null);
      void currentWindow?.hide();
    }, 230);
    return () => clearTimeout(t);
  }, [phase]);

  const launchApp = (a: App) => {
    void openApp(a.id);
    close();
  };
  const openUri = (uri: string) => {
    void api.openPath(uri);
    close();
  };
  const runPower = (action: PowerAction) => {
    close();
    void api.powerAction(action);
  };

  const visibleApps = useMemo(() => apps.filter((a) => !norm?.hidden.includes(a.id)), [apps, norm]);
  const results = useMemo(() => matchApps(visibleApps, query).slice(0, cols * rows), [visibleApps, query, cols, rows]);
  useEffect(() => setSel(0), [query]);

  const go = useCallback((d: number) => setPage((p) => clamp(Math.min(p, lastPage) + d, 0, lastPage)), [lastPage]);

  const winTap = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Meta") {
        if (!e.repeat) {
          winTap.current = true;
          void api.maskWin();
        }
      } else if (e.keyCode !== 0xe8) winTap.current = false;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Meta" && winTap.current) {
        winTap.current = false;
        close();
      }
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "open" || modalOpen.current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "Escape") {
        if (Date.now() - openedAt.current < 400) return;
        if (sub) setSub(null);
        else if (folder) setFolder(null);
        else if (category) setCategory(null);
        else if (query) setQuery("");
        else if (editing) setEditing(false);
        else close();
        return;
      }
      if (query) {
        if (e.key === "ArrowRight") setSel((s) => Math.min(results.length - 1, s + 1));
        else if (e.key === "ArrowLeft") setSel((s) => Math.max(0, s - 1));
        else if (e.key === "ArrowDown") setSel((s) => Math.min(results.length - 1, s + cols));
        else if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - cols));
        else if (e.key === "Enter" && results[sel]) launchApp(results[sel]);
        return;
      }
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setQuery((q) => q + e.key);
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const wheel = useRef({ acc: 0, lock: 0 });
  const onWheel = (e: WheelEvent) => {
    if (!paged || folder || query || drag || category) return;
    const w = wheel.current;
    w.acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Date.now() < w.lock || Math.abs(w.acc) <= 60) return;
    go(Math.sign(w.acc));
    w.acc = 0;
    w.lock = Date.now() + 450;
  };

  const swipe = useRef<{ x: number } | null>(null);
  const suppressClick = useRef(false);
  const press = useRef({ x: 0, y: 0, t: 0, ux: 0, uy: 0, ut: 0 });
  const isTap = () => {
    const p = press.current;
    return Math.hypot(p.ux - p.x, p.uy - p.y) <= 8 && p.ut - p.t < 450;
  };
  const tapLaunch = (a: App) => isTap() && launchApp(a);

  const editingRef = useRef(editing);
  editingRef.current = editing;
  const pending = useRef<{ item: Item; from: Loc; x: number; y: number; timer: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const edge = useRef<{ dir: number; timer: number } | null>(null);
  const pageRef = useRef(curPage);
  pageRef.current = curPage;
  const ctx = useRef({ pages, dims, m, norm });
  ctx.current = { pages, dims, m, norm };

  const listenPointer = () => {
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
  };
  const endPointer = () => {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
  };

  function onDragMove(e: PointerEvent) {
    const p = pending.current;
    if (p && !dragRef.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 6) return;
      clearTimeout(p.timer);
      if (!editingRef.current || p.item.pin) {
        pending.current = null;
        return;
      }
      dragRef.current = { item: p.item, from: p.from, x: e.clientX, y: e.clientY, target: null };
    }
    const d = dragRef.current;
    if (!d) return;
    const { pages: pg, dims: dm, m: mm } = ctx.current;
    d.x = e.clientX;
    d.y = e.clientY;
    d.target = pageRef.current < pg.length ? targetAt(e.clientX, e.clientY, pg[pageRef.current] ?? [], dm, mm, d.item) : null;
    const dir = e.clientX < 36 ? -1 : e.clientX > innerWidth - 36 ? 1 : 0;
    if (dir !== (edge.current?.dir ?? 0)) {
      if (edge.current) clearTimeout(edge.current.timer);
      edge.current = dir
        ? {
            dir,
            timer: window.setTimeout(() => {
              setPage((p) => clamp(p + dir, 0, ctx.current.pages.length - 1));
              edge.current = null;
            }, 650),
          }
        : null;
    }
    setDrag({ ...d });
  }

  function onDragUp() {
    endPointer();
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    if (edge.current) clearTimeout(edge.current.timer);
    edge.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    const n = ctx.current.norm;
    if (!d || !n) return;
    suppressClick.current = true;
    const pg = pageRef.current;
    if (!d.target || pg >= n.pages.length) return;
    const { index, merge } = d.target;
    const onto = n.pages[pg][index];
    if (d.from) {
      if (merge && onto) {
        if (d.item.kind === "app" && onto.kind === "app") setLayout(createFolder(n, d.from, { page: pg, index }, folderName(d.item.id, onto.id)));
        else if (onto.kind === "folder") setLayout(addToFolder(n, d.from, { page: pg, index }));
        return;
      }
      setLayout(moveItem(n, d.from, { page: pg, index: reorderIndex(d.from, pg, index) }));
    } else if (d.folderId) {
      setLayout(removeFromFolder(n, d.folderId, d.item.id, { page: pg, index }));
    }
  }

  const beginPointer = (e: ReactPointerEvent, item: Item, from: Loc) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    suppressClick.current = false;
    pending.current = { item, from, x: e.clientX, y: e.clientY, timer: window.setTimeout(() => setEditing(true), 550) };
    listenPointer();
  };

  useEffect(() => endPointer, []);

  const dragOutOfFolder = (entry: FolderEntry, folderId: string, x: number, y: number) => {
    setFolder(null);
    setSub(null);
    dragRef.current = { item: toItem(entry), from: null, folderId, x, y, target: null };
    setDrag({ ...dragRef.current });
    listenPointer();
  };

  const shownPages = useMemo(() => {
    if (!drag?.target || drag.target.merge || curPage >= pages.length) return pages;
    if (drag.from) return moveItem({ ...EMPTY, pages }, drag.from, { page: curPage, index: reorderIndex(drag.from, curPage, drag.target.index) }).pages;
    const copy = pages.map((p) => [...p]);
    copy[curPage].splice(drag.target.index, 0, drag.item);
    return copy;
  }, [drag, pages, curPage]);

  const update = (fn: (l: Layout) => Layout) => norm && setLayout(fn(norm));
  const setWidget = (id: string, patch: Partial<WidgetInstance>) => setWidgets((ws) => (ws[id] ? { ...ws, [id]: { ...ws[id], ...patch } } : ws));
  const setWidgetOptions = (id: string, patch: Options) => setWidgets((ws) => (ws[id] ? { ...ws, [id]: { ...ws[id], options: { ...ws[id].options, ...patch } } } : ws));
  const removeWidget = (id: string) => setWidgets((ws) => withoutWidget(ws, id));
  const categoryOf = (id: string) => {
    const a = byId.get(id);
    return a ? categorize(a.name, norm?.categories, a.id) : "other";
  };
  const folderName = (aId: string, bId: string) => (categoryOf(aId) === categoryOf(bId) ? categoryName(categoryOf(aId)) : "Folder");

  const editItem: MenuItem = { label: editing ? "Done Editing" : "Edit", onClick: () => setEditing((x) => !x) };
  const lockItem = (index: number): MenuItem => {
    const loc = { page: curPage, index };
    if (pages[curPage]?.[index]?.pin) return { label: "Unlock", onClick: () => update((l) => setPin(l, loc, null)) };
    return {
      label: "Lock Position",
      onClick: () => {
        const c = packPage(specs(pages[curPage], dims), cols, rows)[index];
        if (c) update((l) => setPin(l, loc, { col: c.col, row: c.row }));
      },
    };
  };
  const appMenu = (e: MouseEvent, a: App, opts: { folderId?: string; hidden?: boolean; index?: number } = {}) => {
    e.stopPropagation();
    openMenu(e, [
      { label: "Open", onClick: () => launchApp(a) },
      { label: "Show in Explorer", onClick: () => api.revealApp(a.target) },
      { label: "Change Category…", onClick: () => setCatFor(a) },
      ...(opts.folderId ? [{ label: "Remove from Folder", onClick: () => update((l) => removeFromFolder(l, opts.folderId!, a.id)) }] : []),
      ...(opts.index !== undefined ? [lockItem(opts.index)] : []),
      opts.hidden ? { label: "Unhide", onClick: () => update((l) => unhideApp(l, a.id)) } : { label: "Hide", onClick: () => update((l) => hideApp(l, a.id)) },
      { separator: true },
      { label: "Uninstall…", danger: true, onClick: () => api.openPath("ms-settings:appsfeatures") },
      { separator: true },
      editItem,
    ]);
  };
  const itemMenu = (e: MouseEvent, index: number) => {
    const it = pages[curPage]?.[index];
    if (!it) return;
    e.stopPropagation();
    if (it.kind === "app") {
      const a = byId.get(it.id);
      if (a) appMenu(e, a, { index });
    } else if (it.kind === "folder") {
      openMenu(e, [
        { label: "Open", onClick: () => setFolder(it.id) },
        lockItem(index),
        { label: "Ungroup Folder", onClick: () => update((l) => dissolveFolder(l, it.id)) },
        { separator: true },
        editItem,
      ]);
    } else {
      const w = widgets[it.id];
      openMenu(e, [
        { label: "Edit Widget…", onClick: () => setEditWidget(it.id) },
        ...(["s", "m", "l"] as const).map((s) => ({ label: `Size: ${SIZE_LABEL[s]}`, disabled: w?.size === s, onClick: () => setWidget(it.id, { size: s }) })),
        lockItem(index),
        { label: "Remove Widget", danger: true, onClick: () => removeWidget(it.id) },
        { separator: true },
        { label: "Add Widget…", onClick: () => setGallery(true) },
        editItem,
      ]);
    }
  };
  const backgroundMenu = (e: MouseEvent) =>
    openMenu(e, [
      ...(paged ? [{ label: "Add Widget…", onClick: () => setGallery(true) }, editItem, { separator: true } as const] : []),
      { label: "WinPad Settings…", onClick: () => api.openSettings() },
    ]);

  const onItemClick = (e: MouseEvent, index: number) => {
    e.stopPropagation();
    if (suppressClick.current) return void (suppressClick.current = false);
    const it = pages[curPage]?.[index];
    if (!it || it.kind === "widget" || !isTap()) return;
    if (it.kind === "folder") setFolder(it.id);
    else if (!editing) {
      const a = byId.get(it.id);
      if (a) launchApp(a);
    }
  };

  const groups = useMemo(() => (norm ? libraryGroups(apps, history, norm.hidden, norm.categories) : []), [apps, history, norm]);
  const openFolderItem = folder ? (pages.flat().find((it) => it.kind === "folder" && it.id === folder) as FolderItem | undefined) : undefined;
  const openSub = sub ? (openFolderItem?.apps.find((e) => typeof e !== "string" && e.id === sub) as SubFolder | undefined) : undefined;
  const panel = openSub ?? openFolderItem;
  const subMenu = (e: MouseEvent, s: SubFolder) => {
    e.stopPropagation();
    openMenu(e, [
      { label: "Open", onClick: () => setSub(s.id) },
      { label: "Remove from Folder", onClick: () => openFolderItem && update((l) => removeFromFolder(l, openFolderItem.id, s.id)) },
      { label: "Ungroup Folder", onClick: () => update((l) => dissolveFolder(l, s.id)) },
    ]);
  };
  const openGroup = category ? groups.find((g) => g.key === category) : undefined;
  const shown = phase === "open";
  if (phase === "closed") return null;
  const libSize = Math.min(m.cellW * 1.55, (size.h - m.top - 120) / 3 - 30, 240);
  const editingWidget = editWidget ? widgets[editWidget] : undefined;
  const busy = !!(query || folder || drag || category);

  return (
    <div
      style={{ position: "fixed", inset: 0, overflow: "clip", opacity: shown ? 1 : 0, transition: "opacity .22s ease", pointerEvents: shown ? "auto" : "none" }}
      onWheel={onWheel}
      onContextMenu={backgroundMenu}
      onPointerDownCapture={(e) => {
        const t = Date.now();
        press.current = { x: e.clientX, y: e.clientY, t, ux: e.clientX, uy: e.clientY, ut: t };
      }}
      onPointerUpCapture={(e) => Object.assign(press.current, { ux: e.clientX, uy: e.clientY, ut: Date.now() })}
      onPointerDown={(e) => {
        suppressClick.current = false;
        if (e.button === 0) swipe.current = { x: e.clientX };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s || busy) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 80) {
          go(dx < 0 ? 1 : -1);
          suppressClick.current = true;
        }
      }}
      onClick={() => {
        if (suppressClick.current) return void (suppressClick.current = false);
        if (folder || !isTap()) return;
        if (category) setCategory(null);
        else if (editing) setEditing(false);
        else close();
      }}
    >
      {view === "window" ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <AppWindow
            apps={visibleApps}
            groups={groups}
            results={results}
            sel={sel}
            query={query}
            setQuery={setQuery}
            searchRef={searchRef}
            wallpaper={wallpaper.blurred}
            onLaunch={tapLaunch}
            onAppContext={(e, a) => appMenu(e, a)}
            onClose={close}
          />
          {phoneMode === "open" && <PhonePanel onOpen={openUri} onCollapse={() => setPhoneMode("collapsed")} style={{ height: WINDOW_H, ...frosted(wallpaper.blurred) }} />}
        </div>
      ) : (
        <>
          <Backdrop dim={0.34} style={{ transform: shown ? "scale(1)" : "scale(1.06)", transition: "transform .35s ease" }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: shown ? "scale(1)" : "scale(1.1)",
              opacity: folder ? 0.25 : 1,
              transition: "transform .3s cubic-bezier(.2,.8,.2,1), opacity .2s",
            }}
          >
            <div style={{ position: "absolute", top: 34, left: 0, right: 0, zIndex: 2, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <SearchBar
                ref={searchRef}
                value={query}
                onChange={setQuery}
                onKeyDown={(e) => {
                  if (query && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) e.preventDefault();
                }}
              />
            </div>

            {query ? (
              <div style={{ position: "absolute", left: m.padX, top: m.top, right: m.padX + phoneSide, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: m.cellH }}>
                {results.map((a, i) => (
                  <AppTile key={a.id} app={a} icon={m.icon} width={m.cellW} selected={i === sel} onLaunch={tapLaunch} onContext={(e, app) => appMenu(e, app)} onHover={() => setSel(i)} />
                ))}
                {!results.length && <div className="empty-note">No results</div>}
              </div>
            ) : library ? (
              <div style={{ position: "absolute", inset: 0, padding: `${m.top}px ${m.padX + phoneSide}px 40px ${m.padX}px` }}>
                {openGroup ? (
                  <CategoryView
                    group={openGroup}
                    icon={m.icon}
                    cell={Math.min(m.cellW, m.icon * 1.7)}
                    onBack={() => setCategory(null)}
                    onLaunch={tapLaunch}
                    onAppContext={(e, a) => appMenu(e, a, { hidden: openGroup.key === "hidden" })}
                  />
                ) : (
                  <AppLibrary groups={groups} size={libSize} onLaunch={tapLaunch} onOpen={(g) => setCategory(g.key)} onAppContext={(e, a) => appMenu(e, a, { hidden: norm?.hidden.includes(a.id) })} />
                )}
              </div>
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", transform: `translateX(${-curPage * size.w}px)`, transition: "transform .45s cubic-bezier(.25,.8,.25,1)" }}>
                {shownPages.map((items, p) => (
                  <div key={p} style={{ position: "relative", flex: "none", width: size.w, height: "100%" }}>
                    {Math.abs(p - curPage) <= 1 && (
                      <Grid
                        items={items}
                        m={m}
                        dims={dims}
                        apps={byId}
                        widgets={widgets}
                        editing={editing}
                        draggingKey={drag ? itemKey(drag.item) : null}
                        mergeKey={drag?.target?.merge && p === curPage ? itemKey(pages[p][drag.target.index]) : null}
                        onPointerDown={(e, i) => p === curPage && beginPointer(e, items[i], { page: p, index: pages[p].indexOf(items[i]) })}
                        onClick={onItemClick}
                        onContextMenu={itemMenu}
                        onRemoveWidget={removeWidget}
                        onWidgetOptions={setWidgetOptions}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {!query && paged && pages.length > 1 && (
              <div style={{ position: "absolute", bottom: 26, left: 0, right: 0 }}>
                <Dots count={pages.length} active={curPage} onPick={setPage} />
              </div>
            )}
          </div>
          {phoneMode === "open" && <PhonePanel onOpen={openUri} onCollapse={() => setPhoneMode("collapsed")} style={{ position: "absolute", top: 86, right: 24, bottom: 40 }} />}
        </>
      )}

      {editing && paged ? (
        <>
          <Glass radius={14} style={{ position: "absolute", top: 30, left: 30, padding: "6px 12px" }}>
            <button
              className="row"
              style={{ gap: 6, fontWeight: 600 }}
              onClick={(e) => {
                e.stopPropagation();
                setGallery(true);
              }}
            >
              <Plus size={15} /> Add Widget
            </button>
          </Glass>
          <Glass radius={14} style={{ position: "absolute", top: 30, right: 30, padding: "6px 14px" }}>
            <button
              style={{ fontWeight: 600 }}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(false);
              }}
            >
              Done
            </button>
          </Glass>
        </>
      ) : (
        <div className="row" style={{ position: "absolute", top: 33, right: 30, gap: 10 }}>
          {phoneMode === "collapsed" && <PhoneToggle onOpen={() => setPhoneMode("open")} />}
          <PowerButton onAction={runPower} />
        </div>
      )}

      {panel && (
        <FolderPanel
          key={panel.id}
          title={panel.name}
          entries={panel.apps}
          byId={byId}
          icon={m.icon}
          parent={openSub && openFolderItem?.name}
          onBack={() => setSub(null)}
          onRename={(name) => update((l) => updateFolder(l, panel.id, { name }))}
          onLaunch={(a) => !editing && tapLaunch(a)}
          onOpenSub={(s) => setSub(s.id)}
          onClose={() => {
            setFolder(null);
            setSub(null);
          }}
          onAppContext={(e, a) => appMenu(e, a, { folderId: panel.id })}
          onSubContext={subMenu}
          onReorder={(entries) => update((l) => updateFolder(l, panel.id, { apps: entries }))}
          onMerge={(a, onto) => update((l) => mergeInFolder(l, panel.id, a, onto, byId.has(onto) ? folderName(a, onto) : "Folder"))}
          onDragOut={(entry, x, y) => dragOutOfFolder(entry, panel.id, x, y)}
        />
      )}

      {drag && (
        <div style={{ position: "fixed", left: drag.x, top: drag.y, transform: "translate(-50%,-50%) scale(1.08)", pointerEvents: "none", zIndex: 60, filter: "drop-shadow(0 12px 24px rgba(0,0,0,.45))" }}>
          {drag.item.kind === "app" && <AppIcon app={byId.get(drag.item.id)} size={m.icon} />}
          {drag.item.kind === "folder" && <FolderIcon items={folderPreview(drag.item.apps, byId)} size={m.icon} />}
          {drag.item.kind === "widget" && widgets[drag.item.id] && <WidgetFrame w={widgets[drag.item.id]} width={m.cellW * 1.6} height={m.cellH * 1.6} />}
        </div>
      )}

      <div onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        {gallery && (
          <WidgetGallery
            onClose={() => setGallery(false)}
            onAdd={(w) => {
              setWidgets((ws) => ({ ...ws, [w.id]: w }));
              update((l) => addWidget(l, w.id, Math.min(curPage, pages.length - 1)));
            }}
          />
        )}
        {editingWidget && <WidgetEditor w={editingWidget} onChange={(w) => setWidgets((ws) => ({ ...ws, [w.id]: w }))} onClose={() => setEditWidget(null)} />}
        {catFor && (
          <Modal title={`Category for ${catFor.name}`} width={360} onClose={() => setCatFor(null)}>
            <div style={{ display: "grid", gap: 4 }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  className="menu-item"
                  style={{ fontWeight: categorize(catFor.name, norm?.categories, catFor.id) === c.key ? 700 : 400 }}
                  onClick={() => {
                    update((l) => ({ ...l, categories: { ...l.categories, [catFor.id]: c.key } }));
                    setCatFor(null);
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
