import { useEffect, useRef, useState } from "react";
import { ArrowRotate, Pause, Play } from "reicon-react";
import { formatDuration } from "../lib/time";
import { Ring } from "./Ring";
import type { WidgetProps } from "./shared";

export function beep() {
  const ctx = new AudioContext();
  [0, 0.35, 0.7].forEach((t) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + t);
    o.stop(ctx.currentTime + t + 0.3);
  });
}

export function Timer({ w }: WidgetProps) {
  const stopwatch = w.style === "stopwatch";
  const total = (w.options.minutes ?? 5) * 60_000;
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const fired = useRef(false);
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => tick((x) => x + 1), stopwatch ? 100 : 250);
    return () => clearInterval(id);
  }, [startedAt, stopwatch]);
  useEffect(() => {
    setElapsed(0);
    setStartedAt(null);
  }, [total, stopwatch]);
  const now = elapsed + (startedAt !== null ? Date.now() - startedAt : 0);
  const left = total - now;
  useEffect(() => {
    if (!stopwatch && startedAt !== null && left <= 0 && !fired.current) {
      fired.current = true;
      setElapsed(total);
      setStartedAt(null);
      beep();
    }
  });
  const running = startedAt !== null;
  const toggle = () => {
    if (running) {
      setElapsed(now);
      setStartedAt(null);
    } else {
      if (!stopwatch && left <= 0) setElapsed(0);
      fired.current = false;
      setStartedAt(Date.now());
    }
  };
  const reset = () => {
    setElapsed(0);
    setStartedAt(null);
  };
  const label = stopwatch ? formatDuration(now, true) : formatDuration(left + 999);
  const color = stopwatch ? "#30d158" : "#ff9f0a";
  const controls = (
    <div className="row" style={{ gap: 10 }} onPointerDown={(e) => e.stopPropagation()}>
      <button aria-label="Reset" className="round-control" onClick={reset} style={{ background: "rgba(255,255,255,.16)" }}>
        <ArrowRotate size={16} />
      </button>
      <button aria-label={running ? "Pause" : "Start"} className="round-control" onClick={toggle} style={{ background: running ? "rgba(255,159,10,.35)" : "rgba(48,209,88,.35)" }}>
        {running ? <Pause size={16} weight="Filled" /> : <Play size={16} weight="Filled" />}
      </button>
    </div>
  );
  if (w.size === "s")
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 10 }}>
        <Ring value={stopwatch ? (now % 60_000) / 60_000 : left / total} size={100} stroke={7} color={color}>
          <span style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{label}</span>
        </Ring>
        {controls}
      </div>
    );
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 20, padding: 18 }}>
      <Ring value={stopwatch ? (now % 60_000) / 60_000 : left / total} size={124} stroke={9} color={color}>
        <span style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{label}</span>
      </Ring>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>{stopwatch ? "Stopwatch" : `${w.options.minutes} min`}</div>
        {controls}
      </div>
    </div>
  );
}
