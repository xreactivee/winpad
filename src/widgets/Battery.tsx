import { BatteryCharging, BatteryFull, Plug } from "lucide-react";
import { api } from "../lib/api";
import { usePoll } from "../lib/hooks";
import { Ring } from "./Ring";
import type { WidgetProps } from "./shared";

export function BatteryWidget({ w }: WidgetProps) {
  const b = usePoll(api.battery, 15_000);
  const color = !b ? "var(--text-3)" : !b.charging && b.percent <= 20 ? "var(--red)" : "var(--green)";
  const ring = (
    <Ring value={b ? b.percent / 100 : 0} size={w.size === "s" ? 108 : 120} stroke={10} color={color}>
      {b ? b.charging ? <BatteryCharging size={30} /> : <BatteryFull size={30} /> : <Plug size={30} />}
    </Ring>
  );
  if (w.size === "s")
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", gap: 4, padding: 10 }}>
        {ring}
        <div style={{ fontSize: 15, fontWeight: 650 }}>{b ? `${b.percent}%` : "No battery"}</div>
      </div>
    );
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 22, padding: 20 }}>
      {ring}
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 15, color: "var(--text-2)" }}>This PC</div>
        <div style={{ fontSize: 40, fontWeight: 600 }}>{b ? `${b.percent}%` : "—"}</div>
        <div style={{ fontSize: 13, color: "var(--text-3)" }}>{!b ? "No battery, on AC power" : b.charging ? "Charging" : "On battery"}</div>
      </div>
    </div>
  );
}
