import type { KeyboardEvent, Ref } from "react";
import { Search, X } from "reicon-react";
import { Glass } from "../components/Glass";

type Props = { value: string; onChange: (v: string) => void; onKeyDown: (e: KeyboardEvent) => void; ref?: Ref<HTMLInputElement> };

export function SearchBar({ value, onChange, onKeyDown, ref }: Props) {
  return (
    <Glass
      radius={12}
      onClick={(e) => e.stopPropagation()}
      style={{ width: 260, height: 32, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", pointerEvents: "auto" }}
    >
      <Search size={14} color="var(--text-2)" />
      <input
        ref={ref}
        value={value}
        placeholder="Search"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="bare-input"
        style={{ flex: 1, fontSize: 13 }}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")} style={{ display: "grid", placeItems: "center", width: 16, height: 16, borderRadius: 8, background: "rgba(255,255,255,.3)" }}>
          <X size={11} strokeWidth={3} />
        </button>
      )}
    </Glass>
  );
}
