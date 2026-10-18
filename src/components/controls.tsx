import type { CSSProperties, MouseEvent, ReactNode } from "react";

export type Choice<T extends string = string> = { value: T; label: string };

export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button role="switch" aria-checked={value} aria-label={label} className="switch" onClick={() => onChange(!value)} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Choice<T>[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange, style }: { value: T; options: Choice<T>[]; onChange: (v: T) => void; style?: CSSProperties }) {
  return (
    <select className="field" value={value} style={style} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type SliderProps = { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; style?: CSSProperties };

export function Slider({ value, min, max, step = 1, onChange, style }: SliderProps) {
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ "--p": `${((value - min) / (max - min)) * 100}%`, ...style } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

type RoundButtonProps = { label: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; badge?: boolean; style?: CSSProperties; children: ReactNode };

export function RoundButton({ label, onClick, badge, style, children }: RoundButtonProps) {
  return (
    <button
      className="glass round-button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      style={style}
    >
      {children}
      {badge && <span className="badge" />}
    </button>
  );
}
