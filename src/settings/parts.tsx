import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useSetting, type Settings as SettingsShape } from "../lib/settings";
import { Switch } from "../components/controls";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card-group">
      {title && <h2>{title}</h2>}
      <div className="card">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {hint && <div className="setting-hint">{hint}</div>}
      </div>
      {children && <div className="setting-control">{children}</div>}
    </div>
  );
}

type BooleanKey = { [K in keyof SettingsShape]: SettingsShape[K] extends boolean ? K : never }[keyof SettingsShape];

export function ToggleRow({ setting, label, hint }: { setting: BooleanKey; label: string; hint?: string }) {
  const [value, setValue] = useSetting(setting);
  return (
    <Row label={label} hint={hint}>
      <Switch value={value} onChange={setValue} label={label} />
    </Row>
  );
}

export type PickerOption<T extends string> = { value: T; label: string; hint: string; art: ReactNode };

export function Picker<T extends string>({ value, options, onChange, columns }: { value: T; options: PickerOption<T>[]; onChange: (v: T) => void; columns?: number }) {
  return (
    <div className="picker" role="radiogroup" style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className="picker-option" onClick={() => onChange(o.value)}>
          <div className="picker-art">{o.art}</div>
          <div className="picker-label">{o.label}</div>
          <div className="picker-hint">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}

export function DragList({ ids, onMove, children }: { ids: string[]; onMove: (id: string, to: number) => void; children: (id: string, index: number) => ReactNode }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const latest = useRef(ids);
  latest.current = ids;

  const start = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input, select, a")) return;
    e.preventDefault();
    const y0 = e.clientY;
    let held = false;
    const move = (ev: PointerEvent) => {
      if (!held && Math.abs(ev.clientY - y0) < 5) return;
      held = true;
      setDragging(id);
      const to = latest.current
        .filter((other) => other !== id)
        .filter((other) => {
          const r = rows.current.get(other)?.getBoundingClientRect();
          return r ? r.top + r.height / 2 < ev.clientY : false;
        }).length;
      if (latest.current.indexOf(id) !== to) onMove(id, to);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="drag-list">
      {ids.map((id, index) => (
        <div
          key={id}
          ref={(el) => {
            if (el) rows.current.set(id, el);
            else rows.current.delete(id);
          }}
          className="drag-row"
          data-dragging={dragging === id || undefined}
          onPointerDown={(e) => start(e, id)}
        >
          <span className="drag-grip" aria-hidden />
          {children(id, index)}
        </div>
      ))}
    </div>
  );
}

export const tiles = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />);
