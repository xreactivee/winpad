import type { App } from "../lib/api";
import { openApp, useApps } from "../lib/apps";
import { byId } from "../lib/util";
import { AppIcon } from "../components/AppIcon";
import type { WidgetProps } from "./shared";

export function Shortcuts({ w }: WidgetProps) {
  const apps = useApps();
  const map = byId(apps);
  const max = w.size === "s" ? 4 : w.size === "m" ? 8 : 16;
  const chosen: string[] = w.options.apps ?? [];
  const list = (chosen.length ? chosen.map((id) => map.get(id)).filter((a): a is App => !!a) : apps).slice(0, max);
  const cols = w.size === "s" ? 2 : 4;
  const icon = w.size === "s" ? 54 : 56;
  return (
    <div
      style={{ height: "100%", padding: 14, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, placeItems: "center", alignContent: "space-evenly" }}
    >
      {list.map((a) => (
        <button
          key={a.id}
          title={a.name}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => openApp(a.id)}
          style={{ display: "grid", justifyItems: "center", gap: 4 }}
        >
          <AppIcon app={a} size={icon} />
          {w.size === "l" && (
            <span className="ellipsis" style={{ fontSize: 11, maxWidth: 70 }}>
              {a.name}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
