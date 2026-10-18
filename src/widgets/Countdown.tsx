import { useNow } from "../lib/hooks";
import { daysUntil } from "../lib/time";
import type { WidgetProps } from "./shared";

export function Countdown({ w }: WidgetProps) {
  const now = useNow(60_000);
  const days = daysUntil(w.options.date ?? "", now);
  const tint: string = w.options.tint ?? "glass";
  const label = days === 0 ? "Today!" : days > 0 ? (days === 1 ? "day left" : "days left") : Math.abs(days) === 1 ? "day ago" : "days ago";
  return (
    <div
      style={{
        height: "100%",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        background: tint !== "glass" ? `linear-gradient(160deg, ${tint}cc, ${tint}80)` : undefined,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 650 }}>{w.options.title}</div>
      <div style={{ fontSize: 12, color: "var(--text-2)" }}>
        {Number.isNaN(days) ? "Pick a date" : new Date(w.options.date).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
      </div>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: 8 }}>
        {days !== 0 && !Number.isNaN(days) && <span style={{ fontSize: w.size === "s" ? 58 : 72, fontWeight: 650, lineHeight: 1, letterSpacing: -2 }}>{Math.abs(days)}</span>}
        <span style={{ fontSize: days === 0 ? 34 : 15, fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}
