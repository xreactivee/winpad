import { useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { ChevronLeft } from "lucide-react";
import type { App } from "../lib/api";
import { useOutsideClick } from "../lib/hooks";
import { entryId, moveEntry, type FolderEntry, type SubFolder } from "../lib/layout";
import { clamp } from "../lib/util";
import { AppIcon } from "../components/AppIcon";
import { Dots } from "../components/Dots";
import { Glass } from "../components/Glass";

type Preview = App | undefined | (App | undefined)[];

export const folderPreview = (entries: FolderEntry[], byId: Map<string, App>): Preview[] =>
  entries.map((e) => (typeof e === "string" ? byId.get(e) : e.apps.map((id) => byId.get(id))));

export function FolderIcon({ items, size }: { items: Preview[]; size: number }) {
  const mini = (size * 0.76) / 3.4;
  return (
    <Glass
      radius={size * 0.225}
      style={{
        width: size,
        height: size,
        display: "grid",
        gridTemplateColumns: `repeat(3, ${mini}px)`,
        gridAutoRows: mini,
        gap: mini * 0.18,
        alignContent: "center",
        justifyContent: "center",
        boxShadow: "inset 0 1px .5px rgba(255,255,255,.5), inset 0 0 0 .5px rgba(255,255,255,.2), 0 4px 12px rgba(0,0,0,.28)",
      }}
    >
      {items.slice(0, 9).map((x, i) => (Array.isArray(x) ? <FolderIcon key={i} items={x} size={mini} /> : <AppIcon key={x?.id ?? i} app={x} size={mini} />))}
    </Glass>
  );
}

type PanelProps = {
  title: string;
  entries: FolderEntry[];
  byId: Map<string, App>;
  icon: number;
  parent?: string;
  onBack: () => void;
  onRename: (name: string) => void;
  onLaunch: (a: App) => void;
  onOpenSub: (s: SubFolder) => void;
  onClose: () => void;
  onAppContext: (e: MouseEvent, a: App) => void;
  onSubContext: (e: MouseEvent, s: SubFolder) => void;
  onReorder: (entries: FolderEntry[]) => void;
  onMerge: (aId: string, ontoId: string) => void;
  onDragOut: (e: FolderEntry, x: number, y: number) => void;
};

const HOLD_MS = 380;

type Drag = { id: string; x: number; y: number; over: number; merge: string | null };

export function FolderPanel(props: PanelProps) {
  const { title, entries, byId, icon, parent, onBack, onRename, onLaunch, onOpenSub, onClose, onAppContext, onSubContext, onReorder, onMerge, onDragOut } = props;
  const ref = useRef<HTMLDivElement>(null);
  const glass = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [name, setName] = useState(title);
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef({ acc: 0, lock: 0 });
  useOutsideClick(ref, onClose);

  const n = entries.length;
  const cols = n <= 9 ? 3 : 4;
  const perPage = cols * 4;
  const pages = Math.max(1, Math.ceil(n / perPage));
  const rowsShown = pages > 1 ? 4 : Math.max(1, Math.ceil(n / cols));
  const cell = icon * 1.55;
  const pageRef = useRef(page);
  pageRef.current = Math.min(page, pages - 1);
  const cur = pageRef.current;
  const go = (d: number) => setPage((p) => clamp(Math.min(p, pages - 1) + d, 0, pages - 1));
  const order = drag && !drag.merge ? moveEntry(entries, drag.id, drag.over) : entries;

  const press = (e: ReactPointerEvent, entry: FolderEntry | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    suppressClick.current = false;
    const start = { x: e.clientX, y: e.clientY };
    const id = entry === null ? "" : entryId(entry);
    let mode: "wait" | "swipe" | "drag" = "wait";
    let last: Drag | null = null;
    let edge: { dir: number; timer: number } | null = null;
    const hold =
      entry === null
        ? 0
        : window.setTimeout(() => {
            mode = "drag";
            suppressClick.current = true;
            last = { id, x: start.x, y: start.y, over: entries.indexOf(entry), merge: null };
            setDrag(last);
          }, HOLD_MS);
    const targetAt = (x: number, y: number) => {
      const r = grid.current!.getBoundingClientRect();
      const col = clamp(Math.floor((x - r.left) / cell), 0, cols - 1);
      const row = clamp(Math.floor((y - r.top) / cell), 0, 3);
      const over = clamp(pageRef.current * perPage + row * cols + col, 0, n - 1);
      const onto = entries[over];
      const near = Math.hypot(x - (r.left + (col + 0.5) * cell), y - (r.top + row * cell + cell / 2 - 12)) < icon * 0.4;
      const merge = !parent && typeof entry === "string" && near && onto && entryId(onto) !== id ? entryId(onto) : null;
      return { over, merge };
    };
    const cleanup = () => {
      clearTimeout(hold);
      if (edge) clearTimeout(edge.timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    const move = (ev: PointerEvent) => {
      if (mode === "wait") {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
        clearTimeout(hold);
        mode = "swipe";
      }
      if (mode !== "drag" || entry === null) return;
      const g = glass.current!.getBoundingClientRect();
      const m = 24;
      if (ev.clientX < g.left - m || ev.clientX > g.right + m || ev.clientY < g.top - m || ev.clientY > g.bottom + m) {
        cleanup();
        setDrag(null);
        onDragOut(entry, ev.clientX, ev.clientY);
        return;
      }
      last = { id, x: ev.clientX, y: ev.clientY, ...targetAt(ev.clientX, ev.clientY) };
      setDrag(last);
      const dir = ev.clientX < g.left + 40 ? -1 : ev.clientX > g.right - 40 ? 1 : 0;
      if (dir !== (edge?.dir ?? 0)) {
        if (edge) clearTimeout(edge.timer);
        edge = dir ? { dir, timer: window.setTimeout(() => ((edge = null), go(dir)), 600) } : null;
      }
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      if (mode === "swipe") {
        const dx = ev.clientX - start.x;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        suppressClick.current = true;
        return;
      }
      if (mode !== "drag" || !last) return;
      setDrag(null);
      if (last.merge) onMerge(id, last.merge);
      else onReorder(moveEntry(entries, id, last.over));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onWheel = (e: WheelEvent) => {
    const w = wheel.current;
    w.acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Date.now() < w.lock || Math.abs(w.acc) < 50) return;
    go(Math.sign(w.acc));
    w.acc = 0;
    w.lock = Date.now() + 400;
  };

  const dragged = drag ? entries.find((e) => entryId(e) === drag.id) : undefined;
  const iconOf = (e: FolderEntry, size: number) =>
    typeof e === "string" ? <AppIcon app={byId.get(e)} size={size} /> : <FolderIcon items={folderPreview(e.apps, byId)} size={size} />;

  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 40, background: "rgba(0,0,0,.18)", animation: "fade-in .2s" }}>
      <div ref={ref} style={{ display: "grid", justifyItems: "center", gap: 18, animation: "pop-in .25s cubic-bezier(.2,.9,.3,1.15)" }}>
        <div className="row" style={{ gap: 4 }}>
          {parent !== undefined && (
            <button aria-label={`Back to ${parent}`} title={parent} onClick={onBack} style={{ display: "grid", placeItems: "center", textShadow: "0 2px 10px rgba(0,0,0,.4)" }}>
              <ChevronLeft size={32} strokeWidth={2.5} />
            </button>
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onRename(name.trim() || title)}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            onPointerDown={(e) => e.stopPropagation()}
            className="bare-input"
            style={{ textAlign: "center", fontSize: 30, fontWeight: 600, textShadow: "0 2px 10px rgba(0,0,0,.4)" }}
          />
        </div>
        <Glass ref={glass} liquid radius={38} style={{ padding: 26, overflow: "hidden", touchAction: "none" }} onPointerDown={(e) => press(e, null)} onWheel={onWheel}>
          <div ref={grid} style={{ width: cols * cell, height: rowsShown * cell, overflow: "hidden" }}>
            <div style={{ display: "flex", transform: `translateX(${-cur * cols * cell}px)`, transition: "transform .4s cubic-bezier(.25,.8,.25,1)" }}>
              {Array.from({ length: pages }, (_, p) => (
                <div key={p} style={{ flex: "none", width: cols * cell, display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: cell, alignContent: "start" }}>
                  {order.slice(p * perPage, (p + 1) * perPage).map((e) => {
                    const id = entryId(e);
                    const app = typeof e === "string" ? byId.get(e) : undefined;
                    const target = drag?.merge === id;
                    return (
                      <button
                        key={id}
                        className="app-tile"
                        onClick={() => {
                          if (suppressClick.current) return void (suppressClick.current = false);
                          if (typeof e !== "string") onOpenSub(e);
                          else if (app) onLaunch(app);
                        }}
                        onContextMenu={(ev) => (typeof e === "string" ? app && onAppContext(ev, app) : onSubContext(ev, e))}
                        onPointerDown={(ev) => press(ev, e)}
                        style={{ height: cell, opacity: id === drag?.id ? 0.25 : 1, transition: "opacity .15s" }}
                      >
                        <div
                          style={{
                            borderRadius: icon * 0.225,
                            transform: target ? "scale(1.15)" : undefined,
                            boxShadow: target ? "0 0 0 3px rgba(255,255,255,.5)" : undefined,
                            transition: "transform .2s",
                          }}
                        >
                          {iconOf(e, icon)}
                        </div>
                        <span className="app-label" style={{ maxWidth: cell - 8 }}>
                          {typeof e === "string" ? app?.name : e.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {pages > 1 && <Dots count={pages} active={cur} onPick={setPage} />}
        </Glass>
      </div>
      {drag && dragged !== undefined && (
        <div style={{ position: "absolute", left: drag.x, top: drag.y, transform: "translate(-50%,-50%) scale(1.08)", pointerEvents: "none", filter: "drop-shadow(0 12px 24px rgba(0,0,0,.45))" }}>
          {iconOf(dragged, icon)}
        </div>
      )}
    </div>
  );
}
