import { useState } from "react";
import { Plus } from "lucide-react";
import type { WidgetProps } from "./shared";

type Todo = { id: string; text: string; done: boolean };

export function Reminders({ w, setOptions, preview }: WidgetProps) {
  const items: Todo[] = w.options.items ?? [];
  const [draft, setDraft] = useState("");
  const max = w.size === "l" ? 11 : 4;
  const open = items.filter((i) => !i.done).length;
  const save = (next: Todo[]) => setOptions({ items: next });
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    save([...items, { id: Date.now().toString(36), text, done: false }]);
    setDraft("");
  };
  const toggle = (id: string) => {
    const next = items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
    save(next);
    setTimeout(() => setOptions({ items: next.filter((i) => !i.done) }), 1200);
  };
  return (
    <div style={{ height: "100%", padding: 14, display: "flex", flexDirection: "column", gap: 6 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--orange)" }}>{w.options.title}</span>
        <span style={{ fontSize: 22, fontWeight: 650 }}>{open}</span>
      </div>
      <div style={{ display: "grid", gap: 5, gridTemplateColumns: w.size === "m" ? "1fr 1fr" : "1fr", alignContent: "start", flex: 1, overflow: "hidden" }}>
        {items.slice(0, max).map((i) => (
          <button key={i.id} className="row" onClick={() => toggle(i.id)} style={{ gap: 8, textAlign: "left", fontSize: 13 }}>
            <span
              style={{
                width: 16,
                height: 16,
                flex: "none",
                borderRadius: 8,
                border: `1.5px solid ${i.done ? "var(--orange)" : "rgba(255,255,255,.45)"}`,
                background: i.done ? "var(--orange)" : undefined,
                boxShadow: i.done ? "inset 0 0 0 2.5px #2c2c2e" : undefined,
              }}
            />
            <span style={{ opacity: i.done ? 0.5 : 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.text}</span>
          </button>
        ))}
        {!items.length && <span style={{ color: "var(--text-3)", fontSize: 13 }}>No reminders</span>}
      </div>
      {!preview && (
        <div className="row" style={{ gap: 6 }}>
          <Plus size={15} color="var(--text-3)" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New reminder"
            style={{ flex: 1, border: 0, outline: "none", background: "transparent", fontSize: 13, color: "inherit" }}
          />
        </div>
      )}
    </div>
  );
}
