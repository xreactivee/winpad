import { useRef, type CSSProperties, type MouseEvent, type ReactNode, type WheelEvent } from "react";
import { Ring } from "../widgets/Ring";
import { useDock } from "./state";

type Props = {
  label: string;
  tip?: boolean;
  active?: boolean;
  style?: CSSProperties;
  onClick?: (anchor: HTMLElement) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onWheel?: (e: WheelEvent) => void;
  onAuxClick?: (e: MouseEvent) => void;
  children: ReactNode;
};

export function Tile({ label, tip, active, style, onClick, onContextMenu, onWheel, onAuxClick, children }: Props) {
  const dock = useDock();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      className="dock-tile"
      aria-label={label}
      aria-pressed={active}
      style={style}
      onClick={() => ref.current && onClick?.(ref.current)}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.stopPropagation();
        dock.label(null);
        onContextMenu(e);
      }}
      onAuxClick={onAuxClick}
      onWheel={onWheel}
      onPointerEnter={() => tip && dock.labels && dock.label(ref.current, label)}
      onPointerLeave={() => tip && dock.label(null)}
    >
      {children}
    </button>
  );
}

export function MiniRing({ value, color, children }: { value: number; color: string; children?: ReactNode }) {
  const { tile } = useDock();
  return (
    <Ring value={value} size={Math.round(tile * 0.72)} stroke={Math.max(3, tile * 0.08)} color={color}>
      {children}
    </Ring>
  );
}

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
