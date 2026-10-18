import { useNow } from "../lib/hooks";
import type { WidgetProps } from "./shared";

const cap = (s: string) => s.charAt(0).toLocaleUpperCase("en") + s.slice(1);

function DateCard({ now, big }: { now: Date; big?: boolean }) {
  const wd = cap(now.toLocaleDateString("en-US", { weekday: "short" }));
  const mo = cap(now.toLocaleDateString("en-US", { month: "short" }));
  return (
    <div style={{ padding: big ? "20px 22px" : "16px 18px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: big ? 22 : 19, fontWeight: 650, letterSpacing: -0.2 }}>
        <span style={{ color: "var(--red)" }}>{wd}</span> {mo}
      </div>
      <div style={{ fontSize: big ? 120 : 84, fontWeight: 600, lineHeight: 0.95, letterSpacing: -3, marginTop: "auto" }}>{now.getDate()}</div>
    </div>
  );
}

function MonthGrid({ now, compact }: { now: Date; compact?: boolean }) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  const names = ["M", "T", "W", "T", "F", "S", "S"];
  const fs = compact ? 9.5 : 11;
  return (
    <div style={{ padding: compact ? "12px 12px" : "14px 16px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", marginBottom: 6 }}>
        {now.toLocaleDateString("en-US", { month: "long" })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: compact ? 1 : 3, fontSize: fs, textAlign: "center", flex: 1, alignContent: "start" }}>
        {names.map((n, i) => (
          <div key={i} style={{ color: i >= 5 ? "var(--text-3)" : "var(--text-2)", fontWeight: 600 }}>
            {n}
          </div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            style={{
              fontWeight: 600,
              lineHeight: compact ? "15px" : "20px",
              borderRadius: 10,
              color: d === now.getDate() ? "#fff" : i % 7 >= 5 ? "var(--text-3)" : undefined,
              background: d === now.getDate() ? "var(--red)" : undefined,
            }}
          >
            {d || ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Calendar({ w }: WidgetProps) {
  const now = useNow(60_000);
  if (w.style === "date" && w.size === "s") return <DateCard now={now} />;
  if (w.size === "s") return <MonthGrid now={now} compact />;
  if (w.size === "m")
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", height: "100%" }}>
        <DateCard now={now} />
        <MonthGrid now={now} compact />
      </div>
    );
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      <div style={{ height: 150 }}>
        <DateCard now={now} big />
      </div>
      <MonthGrid now={now} />
    </div>
  );
}
