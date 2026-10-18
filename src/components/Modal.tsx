import { useEffect, type ReactNode } from "react";
import { Glass } from "./Glass";

type Props = { onClose: () => void; children: ReactNode; width?: number; title?: string };

export function Modal({ onClose, children, width = 520, title }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 500, display: "grid", placeItems: "center", background: "rgba(0,0,0,.25)", animation: "fade-in .15s" }}
    >
      <Glass
        solid
        frost
        radius={26}
        role="dialog"
        aria-label={title}
        style={{ width, maxWidth: "92vw", maxHeight: "86vh", overflow: "auto", padding: 22, animation: "pop-in .18s ease-out" }}
      >
        {title && <div style={{ fontSize: 17, fontWeight: 650, marginBottom: 14 }}>{title}</div>}
        {children}
      </Glass>
    </div>
  );
}
