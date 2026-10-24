import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "reicon-react";
import { api } from "../lib/api";
import { usePoll } from "../lib/hooks";
import { formatBytes } from "../lib/util";
import { Ring } from "./Ring";
import type { WidgetProps } from "./shared";

const INTERVAL = 2000;

const rate = (bytes: number) => `${formatBytes(bytes / (INTERVAL / 1000))}/s`;

export function SystemWidget({ w }: WidgetProps) {
  const s = usePoll(api.sysStats, INTERVAL);
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (s) setHistory((h) => [...h.slice(-59), s.cpu]);
  }, [s]);
  if (!s) return <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--text-3)" }}>…</div>;
  const items = [
    { label: "CPU", value: s.cpu / 100, text: `${Math.round(s.cpu)}%`, color: "var(--accent)" },
    { label: "Memory", value: s.memUsed / s.memTotal, text: formatBytes(s.memUsed), color: "#bf5af2" },
    { label: "Disk", value: s.diskUsed / Math.max(1, s.diskTotal), text: `${formatBytes(s.diskTotal - s.diskUsed)} free`, color: "var(--orange)" },
  ];
  const net = (
    <div style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
      <span className="row" style={{ gap: 4 }}>
        <ArrowDown size={13} color="var(--green)" /> {rate(s.netRx)}
      </span>
      <span className="row" style={{ gap: 4 }}>
        <ArrowUp size={13} color="var(--accent)" /> {rate(s.netTx)}
      </span>
    </div>
  );

  if (w.style === "bars" || w.size === "l") {
    return (
      <div style={{ height: "100%", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>System</div>
        {items.map((it) => (
          <div key={it.label} style={{ display: "grid", gap: 4 }}>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-2)" }}>{it.label}</span>
              <span style={{ fontWeight: 600 }}>{it.text}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
              <div style={{ width: `${it.value * 100}%`, height: "100%", background: it.color, borderRadius: 4, transition: "width .6s" }} />
            </div>
          </div>
        ))}
        {w.size === "l" && (
          <svg viewBox="0 0 60 30" preserveAspectRatio="none" style={{ width: "100%", flex: 1, minHeight: 50 }}>
            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth="0.8"
              points={history.map((v, i) => `${i + 60 - history.length},${30 - (v / 100) * 28}`).join(" ")}
            />
          </svg>
        )}
        {w.size !== "s" && net}
      </div>
    );
  }
  const shown = w.size === "s" ? items.slice(0, 2) : items;
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "space-evenly", padding: 12 }}>
      {shown.map((it) => (
        <div key={it.label} style={{ display: "grid", justifyItems: "center", gap: 6 }}>
          <Ring value={it.value} size={w.size === "s" ? 62 : 74} stroke={7} color={it.color}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{Math.round(it.value * 100)}%</span>
          </Ring>
          <span style={{ fontSize: 11, color: "var(--text-2)" }}>{it.label}</span>
        </div>
      ))}
      {w.size === "m" && net}
    </div>
  );
}
