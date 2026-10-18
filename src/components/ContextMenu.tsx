import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Glass } from "./Glass";

export type MenuItem =
  | { separator: true }
  | { label: string; onClick: () => void; icon?: LucideIcon; danger?: boolean; disabled?: boolean; separator?: false };

type Anchor = { clientX: number; clientY: number; preventDefault?: () => void };
type Open = { x: number; y: number; items: MenuItem[]; alignRight: boolean } | null;

let setOpenGlobal: (open: Open) => void = () => {};

export function openMenu(at: Anchor, items: MenuItem[], alignRight = false) {
  at.preventDefault?.();
  setOpenGlobal({ x: at.clientX, y: at.clientY, items, alignRight });
}

export function ContextMenuHost() {
  const [open, setOpen] = useState<Open>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  setOpenGlobal = setOpen;

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const { offsetWidth: width, offsetHeight: height } = ref.current;
    const x = open.alignRight ? open.x - width : open.x;
    setPos({
      x: Math.max(4, Math.min(x, innerWidth - width - 4)),
      y: open.y + height > innerHeight - 4 ? Math.max(4, open.y - height) : open.y,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", close);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div ref={ref} style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 1000, animation: "pop-in .12s ease-out" }}>
      <Glass solid frost className="menu" role="menu">
        {open.items.map((it, i) =>
          it.separator ? (
            <div key={i} className="menu-sep" />
          ) : (
            <button
              key={i}
              role="menuitem"
              className={`menu-item${it.danger ? " danger" : ""}`}
              disabled={it.disabled}
              onClick={() => {
                setOpen(null);
                it.onClick();
              }}
            >
              {it.icon && <it.icon size={15} strokeWidth={1.8} />}
              {it.label}
            </button>
          ),
        )}
      </Glass>
    </div>
  );
}
