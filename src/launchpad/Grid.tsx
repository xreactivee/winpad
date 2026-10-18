import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { Lock } from "lucide-react";
import type { App } from "../lib/api";
import { packPage, specs, type Cell, type Dims, type Item } from "../lib/layout";
import { AppIcon } from "../components/AppIcon";
import { WidgetFrame } from "../widgets/WidgetFrame";
import type { Options, WidgetInstance } from "../widgets/shared";
import { FolderIcon, folderPreview } from "./Folder";

export type Metrics = { padX: number; top: number; cellW: number; cellH: number; icon: number; cols: number; rows: number };

const LABEL_H = 20;

export function metrics(width: number, height: number, cols: number, rows: number): Metrics {
  const padX = Math.max(48, width * 0.085);
  const top = 92;
  const bottom = 64;
  const cellW = (width - padX * 2) / cols;
  const cellH = (height - top - bottom) / rows;
  const icon = Math.round(Math.max(44, Math.min(104, cellW * 0.5, cellH * 0.6)));
  return { padX, top, cellW, cellH, icon, cols, rows };
}

function cellBox(c: Cell, m: Metrics, widget: boolean) {
  const left = c.col * m.cellW;
  const top = c.row * m.cellH;
  const width = c.w * m.cellW;
  const height = c.h * m.cellH;
  if (!widget) return { left, top, width, height };
  const ix = (m.cellW - m.icon) / 2;
  const iy = Math.max(4, (m.cellH - m.icon - LABEL_H) / 2);
  return { left: left + ix, top: top + iy, width: width - ix * 2, height: height - iy * 2 - LABEL_H * 0.5 };
}

export const itemKey = (it: Item) => `${it.kind}:${it.id}`;

type Props = {
  items: Item[];
  m: Metrics;
  dims: Dims;
  apps: Map<string, App>;
  widgets: Record<string, WidgetInstance>;
  editing: boolean;
  draggingKey: string | null;
  mergeKey: string | null;
  onPointerDown: (e: PointerEvent, index: number) => void;
  onClick: (e: MouseEvent, index: number) => void;
  onContextMenu: (e: MouseEvent, index: number) => void;
  onRemoveWidget: (id: string) => void;
  onWidgetOptions: (id: string, patch: Options) => void;
};

export function Grid({ items, m, dims, apps, widgets, editing, draggingKey, mergeKey, onPointerDown, onClick, onContextMenu, onRemoveWidget, onWidgetOptions }: Props) {
  const cells = packPage(specs(items, dims), m.cols, m.rows);
  return (
    <div style={{ position: "absolute", left: m.padX, top: m.top, width: m.cellW * m.cols, height: m.cellH * m.rows }}>
      {items.map((it, i) => {
        const c = cells[i];
        if (!c) return null;
        const key = itemKey(it);
        const widget = it.kind === "widget";
        const box = cellBox(c, m, widget);
        const handlers = {
          onPointerDown: (e: PointerEvent) => onPointerDown(e, i),
          onClick: (e: MouseEvent) => onClick(e, i),
          onContextMenu: (e: MouseEvent) => onContextMenu(e, i),
        };
        const style: CSSProperties = {
          position: "absolute",
          ...box,
          opacity: key === draggingKey ? 0 : 1,
          transition: "left .3s cubic-bezier(.25,.8,.25,1), top .3s cubic-bezier(.25,.8,.25,1), opacity .15s",
        };
        const lock = editing && it.pin && (
          <LockBadge right={widget ? -7 : (box.width - m.icon) / 2 - 7} top={widget ? -7 : (box.height - m.icon - LABEL_H - 6) / 2 - 7} />
        );
        if (it.kind === "widget") {
          const w = widgets[it.id];
          if (!w) return null;
          return (
            <div key={key} style={style} {...handlers}>
              {lock}
              <WidgetFrame
                w={w}
                width={box.width}
                height={box.height}
                editing={editing && !it.pin}
                onRemove={() => onRemoveWidget(it.id)}
                setOptions={(patch) => onWidgetOptions(it.id, patch)}
              />
            </div>
          );
        }
        const folder = it.kind === "folder";
        const app = folder ? undefined : apps.get(it.id);
        const merging = mergeKey === key;
        return (
          <button key={key} className="app-tile" style={style} {...handlers}>
            {lock}
            <div
              style={{
                animation: editing && !it.pin ? `wiggle .25s ease-in-out ${(i % 4) * -0.06}s infinite` : undefined,
                transform: merging ? "scale(1.18)" : undefined,
                transition: "transform .2s",
                borderRadius: m.icon * 0.225,
                boxShadow: merging ? "0 0 0 3px rgba(255,255,255,.5)" : undefined,
              }}
            >
              {folder ? <FolderIcon items={folderPreview(it.apps, apps)} size={m.icon} /> : <AppIcon app={app} size={m.icon} />}
            </div>
            <span className="app-label" style={{ maxWidth: m.cellW - 8 }}>
              {folder ? it.name : app?.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LockBadge({ right, top }: { right: number; top: number }) {
  return (
    <span aria-label="Locked" className="corner-badge" style={{ right, top, pointerEvents: "none" }}>
      <Lock size={12} strokeWidth={2.6} />
    </span>
  );
}
