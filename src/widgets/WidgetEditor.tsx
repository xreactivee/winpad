import { useState, type ReactNode } from "react";
import { api, inTauri } from "../lib/api";
import { useApps } from "../lib/apps";
import { matchApps } from "../lib/layout";
import { AppIcon } from "../components/AppIcon";
import { Modal } from "../components/Modal";
import { Segmented, Select, Slider, Switch } from "../components/controls";
import { SIZE_LABEL, ZONES, widgetDef, type Field, type Options, type WidgetInstance } from "./registry";
import { WidgetFrame } from "./WidgetFrame";
import { BASE } from "./shared";

type Props = { w: WidgetInstance; onChange: (w: WidgetInstance) => void; onClose: () => void };

export function WidgetEditor({ w, onChange, onClose }: Props) {
  const def = widgetDef(w.type)!;
  const set = (patch: Partial<WidgetInstance>) => onChange({ ...w, ...patch });
  const setOption = (patch: Options) => set({ options: { ...w.options, ...patch } });
  const fields = def.fields.filter((f) => !f.styles || f.styles.includes(w.style));
  return (
    <Modal onClose={onClose} width={640} title={`${def.name} Widget`}>
      <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
        <div className="well" style={{ flex: "none", width: 260, height: 260, display: "grid", placeItems: "center" }}>
          <WidgetFrame w={w} width={240} height={240 * (BASE[w.size].h / BASE[w.size].w)} preview setOptions={setOption} />
        </div>
        <div style={{ flex: 1, display: "grid", gap: 14 }}>
          {def.sizes.length > 1 && (
            <Labeled label="Size">
              <Segmented value={w.size} options={def.sizes.map((s) => ({ value: s, label: SIZE_LABEL[s] }))} onChange={(size) => set({ size })} />
            </Labeled>
          )}
          {def.styles.length > 1 && (
            <Labeled label="Style">
              <Select value={w.style} options={def.styles} onChange={(style) => set({ style })} />
            </Labeled>
          )}
          {fields.map((f) => (
            <Labeled key={f.key} label={f.label}>
              <FieldInput field={f} value={w.options[f.key]} onChange={(v) => setOption({ [f.key]: v })} />
            </Labeled>
          ))}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-2)" }}>{label}</span>
      {children}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: Options[string]; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "text":
      return <TextField value={value ?? ""} onCommit={onChange} />;
    case "date":
      return <input className="field" type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <div className="row">
          <Slider value={value ?? field.min} min={field.min} max={field.max} step={field.step} onChange={onChange} />
          <span style={{ width: 40, textAlign: "right" }}>{value}</span>
        </div>
      );
    case "toggle":
      return <Switch value={!!value} onChange={onChange} label={field.label} />;
    case "select":
      return <Select value={value ?? ""} options={field.choices} onChange={onChange} />;
    case "color":
      return (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {field.choices.map((c) => (
            <button
              key={c.value}
              title={c.label}
              aria-label={c.label}
              aria-pressed={value === c.value}
              className="swatch"
              onClick={() => onChange(c.value)}
              style={{ background: c.value === "glass" ? "linear-gradient(135deg,rgba(255,255,255,.5),rgba(255,255,255,.1))" : c.value }}
            />
          ))}
        </div>
      );
    case "folder":
      return (
        <div className="row">
          <span className="ellipsis" style={{ flex: 1, color: "var(--text-2)" }}>
            {value || "None selected"}
          </span>
          <button
            className="btn small"
            disabled={!inTauri}
            onClick={async () => {
              const dir = await api.pickFolder();
              if (dir) onChange(dir);
            }}
          >
            Choose Folder…
          </button>
        </div>
      );
    case "zones": {
      const selected: string[] = value ?? [];
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {ZONES.map((z) => (
            <label key={z.value} className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={selected.includes(z.value)}
                onChange={(e) => onChange(e.target.checked ? [...selected, z.value] : selected.filter((s) => s !== z.value))}
              />
              {z.label}
            </label>
          ))}
        </div>
      );
    }
    case "apps":
      return <AppPicker value={value ?? []} onChange={onChange} />;
  }
}

function TextField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="field"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === "Enter" && onCommit(draft)}
    />
  );
}

function AppPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const apps = useApps();
  const [query, setQuery] = useState("");
  const list = query ? matchApps(apps, query) : apps;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <input className="field" placeholder="Search apps" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="scroll" style={{ maxHeight: 180, display: "grid", gap: 2 }}>
        {list.map((a) => {
          const on = value.includes(a.id);
          return (
            <button key={a.id} className="row list-item" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== a.id) : [...value, a.id])} style={{ padding: "3px 6px" }}>
              <AppIcon app={a} size={22} />
              <span style={{ flex: 1 }}>{a.name}</span>
              {on && <span>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
