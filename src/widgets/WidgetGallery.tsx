import { useState } from "react";
import type { WidgetSize } from "../lib/layout";
import { Modal } from "../components/Modal";
import { Segmented, Select } from "../components/controls";
import { SIZE_LABEL, WIDGETS, newWidget, widgetDef, type WidgetInstance } from "./registry";
import { WidgetFrame } from "./WidgetFrame";

type Props = { onAdd: (w: WidgetInstance) => void; onClose: () => void };

export function WidgetGallery({ onAdd, onClose }: Props) {
  const [type, setType] = useState(WIDGETS[0].type);
  const def = widgetDef(type)!;
  const [size, setSize] = useState<WidgetSize>(def.sizes[0]);
  const [style, setStyle] = useState(def.styles[0].value);
  const pick = (t: string) => {
    const next = widgetDef(t)!;
    setType(t);
    setSize(next.sizes.includes(size) ? size : next.sizes[0]);
    setStyle(next.styles[0].value);
  };
  return (
    <Modal onClose={onClose} width={820} title="Add Widget">
      <div style={{ display: "flex", gap: 18, height: 440 }}>
        <div className="scroll" style={{ width: 230, flex: "none", display: "grid", alignContent: "start", gap: 2 }}>
          {WIDGETS.map((d) => (
            <button key={d.type} className="list-item" aria-pressed={d.type === type} onClick={() => pick(d.type)}>
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{d.description}</div>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateRows: "1fr auto", gap: 14 }}>
          <div className="well" style={{ display: "grid", placeItems: "center" }}>
            <WidgetFrame w={newWidget(type, size, style, "preview")} preview />
          </div>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="row">
              {def.sizes.length > 1 && <Segmented value={size} options={def.sizes.map((s) => ({ value: s, label: SIZE_LABEL[s] }))} onChange={setSize} />}
              {def.styles.length > 1 && <Select value={style} options={def.styles} onChange={setStyle} style={{ width: 170 }} />}
            </div>
            <button
              className="btn primary"
              onClick={() => {
                onAdd(newWidget(type, size, style));
                onClose();
              }}
            >
              Add Widget
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
