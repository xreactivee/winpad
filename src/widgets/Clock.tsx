import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNow } from "../lib/hooks";
import { useSetting } from "../lib/settings";
import { displayHour, longDate, pad, timeInWords, zoned, type ZonedTime } from "../lib/time";
import { BASE, ZONES, type WidgetInstance, type WidgetProps } from "./shared";

const zoneLabel = (z: string) => ZONES.find((x) => x.value === z)?.label ?? "Local";

export function Clock({ w }: WidgetProps) {
  const now = useNow(1000);
  const t = zoned(now, w.options.zone);
  switch (w.style) {
    case "digital":
      return <Digital t={t} w={w} />;
    case "flip":
      return <Flip t={t} w={w} />;
    case "world":
      return <World now={now} w={w} />;
    case "words":
      return <Words t={t} w={w} />;
    default:
      return (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 20, padding: 14 }}>
          <Analog t={t} size={w.size === "l" ? 300 : 136} face={w.options.face} seconds={w.options.seconds} />
          {w.size === "m" && (
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 15, color: "var(--text-2)" }}>{zoneLabel(w.options.zone)}</div>
              <div style={{ fontSize: 34, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {pad(t.h)}:{pad(t.m)}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>{longDate(now)}</div>
            </div>
          )}
        </div>
      );
  }
}

function Analog({ t, size, face = "light", seconds = true }: { t: ZonedTime; size: number; face?: string; seconds?: boolean }) {
  const light = face !== "dark";
  const total = Math.floor(t.date.getTime() / 1000);
  const off = (((t.h * 3600 + t.m * 60 + t.s - (total % 86400)) % 86400) + 129600) % 86400 - 43200;
  const secs = total + off - 1_700_006_400;
  const sec = secs * 6;
  const min = secs * 0.1;
  const hr = secs / 120;
  const fg = light ? "#111" : "#fff";
  const nums = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flex: "none", filter: "drop-shadow(0 4px 10px rgba(0,0,0,.35))" }}>
      <circle cx="50" cy="50" r="49" fill={light ? "#f5f5f7" : "#1c1c1e"} />
      {Array.from({ length: 60 }, (_, i) => (
        <line key={i} x1="50" y1="3.5" x2="50" y2={i % 5 ? 5.5 : 7.5} stroke={light ? "#8e8e93" : "#636366"} strokeWidth={i % 5 ? 0.5 : 1} transform={`rotate(${i * 6} 50 50)`} />
      ))}
      {nums.map((n) => {
        const a = (n * 30 * Math.PI) / 180;
        return (
          <text key={n} x={50 + Math.sin(a) * 36} y={50 - Math.cos(a) * 36 + 4.2} textAnchor="middle" fontSize="11" fontWeight="600" fill={fg} fontFamily="var(--font)">
            {n}
          </text>
        );
      })}
      <g style={{ transform: `rotate(${hr}deg)`, transformOrigin: "50px 50px", transition: "transform .3s" }}>
        <line x1="50" y1="50" x2="50" y2="27" stroke={fg} strokeWidth="3.4" strokeLinecap="round" />
      </g>
      <g style={{ transform: `rotate(${min}deg)`, transformOrigin: "50px 50px", transition: "transform .3s" }}>
        <line x1="50" y1="50" x2="50" y2="12" stroke={fg} strokeWidth="2.4" strokeLinecap="round" />
      </g>
      {seconds && (
        <g style={{ transform: `rotate(${sec}deg)`, transformOrigin: "50px 50px", transition: "transform .25s cubic-bezier(.4,2.2,.6,1)" }}>
          <line x1="50" y1="58" x2="50" y2="10" stroke="#ff9f0a" strokeWidth="1" strokeLinecap="round" />
        </g>
      )}
      <circle cx="50" cy="50" r="2.4" fill={seconds ? "#ff9f0a" : fg} />
      <circle cx="50" cy="50" r="1" fill={light ? "#f5f5f7" : "#1c1c1e"} />
    </svg>
  );
}

function Digital({ t, w }: { t: ZonedTime; w: WidgetInstance }) {
  const [clock24] = useSetting("clock24");
  const h = displayHour(t.h, clock24);
  const big = w.size === "s" ? 46 : w.size === "m" ? 72 : 96;
  return (
    <div style={{ height: "100%", display: "grid", placeContent: "center", textAlign: "center", gap: 4 }}>
      <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 600 }}>{zoneLabel(w.options.zone)}</div>
      <div style={{ fontSize: big, fontWeight: 250, letterSpacing: -1, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {pad(h)}:{pad(t.m)}
        {w.options.seconds && w.size !== "s" && <span style={{ fontSize: big * 0.45, color: "var(--text-3)" }}>:{pad(t.s)}</span>}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-3)" }}>{longDate(t.date)}</div>
    </div>
  );
}

const CARD = {
  black: { top: "linear-gradient(#2c2c30,#232326)", bottom: "linear-gradient(#202023,#1a1a1d)", rim: "inset 0 0 0 .5px rgba(255,255,255,.08)" },
  glass: {
    top: "linear-gradient(rgba(255,255,255,.22),rgba(255,255,255,.13))",
    bottom: "linear-gradient(rgba(255,255,255,.1),rgba(255,255,255,.06))",
    rim: "inset 0 1px .5px rgba(255,255,255,.45), inset 0 0 0 1px rgba(255,255,255,.12)",
  },
};

function FlipCard({ value, width, height, card }: { value: string; width: number; height: number; card: keyof typeof CARD }) {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState(value);
  const [flipping, setFlipping] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => {
    if (value === shown) return;
    setPrev(shown);
    setShown(value);
    setFlipping(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlipping(false), 600);
  }, [value, shown]);
  const c = CARD[card] ?? CARD.black;
  const r = Math.min(22, width * 0.14);
  const half = (text: string, top: boolean, extra: CSSProperties = {}): ReactNode => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: "50%",
        top: top ? 0 : "50%",
        overflow: "hidden",
        background: top ? c.top : c.bottom,
        borderRadius: top ? `${r}px ${r}px 0 0` : `0 0 ${r}px ${r}px`,
        backfaceVisibility: "hidden",
        ...extra,
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, height, top: top ? 0 : -height / 2, display: "grid", placeItems: "center" }}>{text}</div>
    </div>
  );
  return (
    <div
      style={{
        position: "relative",
        flex: "none",
        width,
        height,
        fontSize: Math.min(height * 0.7, width * 0.6),
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: -1,
        perspective: 600,
        boxShadow: `0 8px 20px rgba(0,0,0,.4), ${c.rim}`,
        borderRadius: r,
      }}
    >
      {half(shown, true)}
      {half(flipping ? prev : shown, false)}
      {flipping && (
        <>
          {half(prev, true, { transformOrigin: "bottom", animation: "flip-top .3s ease-in forwards", zIndex: 2 })}
          {half(shown, false, { transformOrigin: "top", transform: "rotateX(90deg)", animation: "flip-bottom .3s .3s ease-out forwards", zIndex: 2 })}
        </>
      )}
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1.5, background: "rgba(0,0,0,.6)", zIndex: 3 }} />
    </div>
  );
}

function Flip({ t, w }: { t: ZonedTime; w: WidgetInstance }) {
  const [clock24] = useSetting("clock24");
  const h = displayHour(t.h, clock24);
  const groups = [pad(h), pad(t.m), ...(w.options.seconds && w.size !== "s" ? [pad(t.s)] : [])];
  const box = BASE[w.size];
  const date = w.size === "l";
  const gap = w.size === "s" ? 6 : 10;
  const cardW = (box.w - gap * (groups.length - 1)) / groups.length;
  const cardH = Math.min(box.h - (date ? 34 : 0), cardW * 1.3);
  return (
    <div style={{ height: "100%", display: "grid", placeContent: "center", gap: 12, justifyItems: "center" }}>
      <style>{`@keyframes flip-top{to{transform:rotateX(-90deg)}}@keyframes flip-bottom{to{transform:rotateX(0)}}`}</style>
      <div style={{ display: "flex", gap }}>
        {groups.map((g, i) => (
          <FlipCard key={i} value={g} width={cardW} height={cardH} card={w.options.card} />
        ))}
      </div>
      {date && (
        <div style={{ fontSize: 15, fontWeight: 500, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{longDate(t.date)}</div>
      )}
    </div>
  );
}

function World({ now, w }: { now: Date; w: WidgetInstance }) {
  const zones: string[] = (w.options.zones ?? []).slice(0, w.size === "s" ? 1 : w.size === "m" ? 4 : 6);
  const diff = (z: string) => {
    const t = zoned(now, z);
    let d = t.h - now.getHours() + (t.m - now.getMinutes()) / 60;
    if (d > 12) d -= 24;
    if (d < -12) d += 24;
    return d === 0 ? "Today" : `${d > 0 ? "+" : ""}${Math.round(d * 10) / 10} h`;
  };
  if (w.size === "l")
    return (
      <div style={{ padding: 18, display: "grid", gap: 10 }}>
        {zones.map((z) => {
          const t = zoned(now, z);
          return (
            <div key={z} className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{zoneLabel(z)}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{diff(z)}</div>
              </div>
              <div style={{ fontSize: 30, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>
                {pad(t.h)}:{pad(t.m)}
              </div>
            </div>
          );
        })}
      </div>
    );
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "space-evenly", padding: 10 }}>
      {zones.map((z) => {
        const t = zoned(now, z);
        const day = t.h >= 6 && t.h < 18;
        return (
          <div key={z} style={{ display: "grid", justifyItems: "center", gap: 6 }}>
            <Analog t={t} size={w.size === "s" ? 120 : 66} face={day ? "light" : "dark"} seconds={false} />
            <div style={{ fontSize: 11, fontWeight: 600 }}>{zoneLabel(z)}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{diff(z)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Words({ t, w }: { t: ZonedTime; w: WidgetInstance }) {
  const text = timeInWords(t.h, t.m);
  return (
    <div style={{ height: "100%", padding: 18, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: w.size === "s" ? 22 : 30, fontWeight: 650, lineHeight: 1.15, textTransform: "capitalize" }}>{text}</div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>{zoneLabel(w.options.zone)}</div>
    </div>
  );
}
