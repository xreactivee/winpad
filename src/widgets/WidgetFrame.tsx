import { Minus } from "reicon-react";
import { Glass } from "../components/Glass";
import { widgetDef } from "./registry";
import { BASE, type Options, type WidgetInstance } from "./shared";

type Props = {
  w: WidgetInstance;
  width?: number;
  height?: number;
  editing?: boolean;
  preview?: boolean;
  onRemove?: () => void;
  setOptions?: (patch: Options) => void;
};

const bare = (w: WidgetInstance) => w.options.background === "none" || (w.type === "photo" && w.style === "fill") || (w.type === "clock" && w.style === "flip");

export function WidgetFrame({ w, width, height, editing, preview, onRemove, setOptions }: Props) {
  const def = widgetDef(w.type);
  if (!def) return null;
  const base = BASE[w.size];
  const sw = width ?? base.w;
  const sh = height ?? base.h;
  const scale = Math.min(sw / base.w, sh / base.h);
  const Widget = def.component;
  const content = <Widget w={w} setOptions={setOptions ?? (() => {})} preview={preview} editing={editing} />;
  const radius = w.size === "s" ? 24 : 26;
  return (
    <div style={{ width: sw, height: sh, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: (sw - base.w) / 2,
          top: (sh - base.h) / 2,
          width: base.w,
          height: base.h,
          transform: scale === 1 ? undefined : `scale(${scale})`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            animation: editing ? `wiggle .28s ease-in-out ${(w.id.charCodeAt(w.id.length - 1) % 5) * -0.05}s infinite` : undefined,
          }}
        >
          {bare(w) ? (
            <div style={{ width: "100%", height: "100%", borderRadius: radius, position: "relative", overflow: w.type === "clock" ? "visible" : "hidden" }}>{content}</div>
          ) : (
            <Glass liquid radius={radius} style={{ width: "100%", height: "100%" }}>
              {content}
            </Glass>
          )}
          {editing && onRemove && (
            <button aria-label="Remove widget" className="corner-badge" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} style={{ left: -8, top: -8, width: 24, height: 24, borderRadius: 12 }}>
              <Minus size={14} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
