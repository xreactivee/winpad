import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRotate, Hourglass, Pause, Play, Stopwatch, Target } from "reicon-react";
import { api } from "../../lib/api";
import type { Toast } from "../../lib/automations";
import { useSetting } from "../../lib/settings";
import { formatDuration } from "../../lib/time";
import { openMenu } from "../../components/ContextMenu";
import { beep } from "../../widgets/Timer";
import { useDock } from "../state";
import { Card, MiniRing, Tile } from "../Tile";

type Clock = { startedAt: number | null; elapsed: number; total: number; laps: number[]; phase: "focus" | "break" };

function store(initial: Clock) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (patch: Partial<Clock>) => {
      state = { ...state, ...patch };
      subs.forEach((f) => f());
    },
    subscribe: (f: () => void) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}

type Store = ReturnType<typeof store>;

const FOCUS = 25 * 60_000;
const BREAK = 5 * 60_000;
const pomodoro = store({ startedAt: null, elapsed: 0, total: FOCUS, laps: [], phase: "focus" });
const timer = store({ startedAt: null, elapsed: 0, total: 5 * 60_000, laps: [], phase: "focus" });
const stopwatch = store({ startedAt: null, elapsed: 0, total: 0, laps: [], phase: "focus" });

export function startFocus(minutes: number) {
  pomodoro.set({ phase: "focus", total: minutes * 60_000, elapsed: 0, startedAt: Date.now(), laps: [] });
}

const elapsedOf = (c: Clock) => c.elapsed + (c.startedAt !== null ? Date.now() - c.startedAt : 0);
const start = (s: Store) => s.set({ startedAt: Date.now() });
const pause = (s: Store) => s.set({ elapsed: elapsedOf(s.get()), startedAt: null });
const reset = (s: Store) => s.set({ elapsed: 0, startedAt: null, laps: [] });

function useClock(s: Store) {
  const c = useSyncExternalStore(s.subscribe, s.get);
  const [, tick] = useState(0);
  useEffect(() => {
    if (c.startedAt === null) return;
    const id = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [c.startedAt]);
  return { ...c, now: elapsedOf(c), running: c.startedAt !== null };
}

function useCountdownEnd(s: Store, onEnd: () => void) {
  const c = useClock(s);
  useEffect(() => {
    if (c.running && c.now >= c.total) onEnd();
  });
  return c;
}

export function usePomodoroRunner(toast: (t: Toast) => void) {
  useCountdownEnd(pomodoro, () => {
    beep();
    const next = pomodoro.get().phase === "focus" ? "break" : "focus";
    pomodoro.set({ phase: next, total: next === "focus" ? FOCUS : BREAK, elapsed: 0, startedAt: Date.now() });
    toast({ key: `pomodoro:${Date.now()}`, title: next === "break" ? "Focus round done" : "Break is over", body: next === "break" ? "Take five minutes" : "Back to focus", source: "Pomodoro" });
  });
}

export function PomodoroTile() {
  const dock = useDock();
  const [focusMusic] = useSetting("autoFocusMusic");
  const c = useClock(pomodoro);
  const toggle = () => {
    if (c.running) return pause(pomodoro);
    start(pomodoro);
    if (focusMusic && c.phase === "focus")
      api
        .mediaInfo()
        .then((m) => {
          if (m && !m.playing) void api.mediaControl("toggle");
        })
        .catch(() => {});
  };
  const color = c.phase === "focus" ? "var(--red)" : "var(--green)";
  return (
    <Tile
      label="Pomodoro"
      style={{ gap: 8, padding: "0 10px" }}
      onClick={toggle}
      onContextMenu={(e) =>
        openMenu(e, [
          { label: c.running ? "Pause" : "Start", onClick: toggle },
          { label: c.phase === "focus" ? "Skip to Break" : "Skip to Focus", onClick: () => pomodoro.set({ phase: c.phase === "focus" ? "break" : "focus", total: c.phase === "focus" ? BREAK : FOCUS, elapsed: 0, startedAt: null }) },
          { label: "Reset", onClick: () => pomodoro.set({ phase: "focus", total: FOCUS, elapsed: 0, startedAt: null }) },
        ])
      }
    >
      <MiniRing value={1 - c.now / c.total} color={color}>
        {c.running ? <Pause size={dock.tile * 0.24} weight="Filled" /> : <Target size={dock.tile * 0.28} />}
      </MiniRing>
      <span style={{ fontSize: dock.tile * 0.28, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatDuration(c.total - c.now + 999)}</span>
    </Tile>
  );
}

const PRESETS = [1, 5, 10, 15, 25, 45, 60];

function TimerCard() {
  const c = useClock(timer);
  return (
    <Card title="Timer">
      <div style={{ fontSize: 40, fontWeight: 300, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{formatDuration(Math.max(0, c.total - c.now) + 999)}</div>
      <div className="row" style={{ flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
        {PRESETS.map((m) => (
          <button key={m} className="chip" aria-pressed={c.total === m * 60_000} onClick={() => timer.set({ total: m * 60_000, elapsed: 0, startedAt: null })}>
            {m} min
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn" onClick={() => reset(timer)}>
          <ArrowRotate size={14} /> Reset
        </button>
        <button
          className="btn primary"
          onClick={() => {
            if (c.running) return pause(timer);
            if (c.now >= c.total) reset(timer);
            start(timer);
          }}
        >
          {c.running ? <Pause size={14} weight="Filled" /> : <Play size={14} weight="Filled" />} {c.running ? "Pause" : "Start"}
        </button>
      </div>
    </Card>
  );
}

export function TimerTile() {
  const dock = useDock();
  const c = useCountdownEnd(timer, () => {
    beep();
    pause(timer);
    timer.set({ elapsed: timer.get().total });
    dock.toast({ key: `timer:${Date.now()}`, title: "Time is up", body: `${Math.round(timer.get().total / 60_000)} min timer`, source: "Timer" });
  });
  const left = Math.max(0, c.total - c.now);
  return (
    <Tile label="Timer" style={{ gap: 8, padding: "0 10px" }} onClick={(anchor) => dock.toggle("timer", anchor, <TimerCard />, 300)}>
      <MiniRing value={left / c.total} color="var(--orange)">
        <Hourglass size={dock.tile * 0.26} />
      </MiniRing>
      <span style={{ fontSize: dock.tile * 0.28, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatDuration(left + 999)}</span>
    </Tile>
  );
}

function StopwatchCard() {
  const c = useClock(stopwatch);
  return (
    <Card title="Stopwatch">
      <div style={{ fontSize: 40, fontWeight: 300, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{formatDuration(c.now, true)}</div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn" onClick={() => (c.running ? stopwatch.set({ laps: [c.now, ...c.laps] }) : reset(stopwatch))}>
          {c.running ? "Lap" : "Reset"}
        </button>
        <button className="btn primary" onClick={() => (c.running ? pause(stopwatch) : start(stopwatch))}>
          {c.running ? "Pause" : "Start"}
        </button>
      </div>
      {c.laps.length > 0 && (
        <div className="scroll" style={{ maxHeight: 140, display: "grid", gap: 4 }}>
          {c.laps.map((t, i) => (
            <div key={i} className="row" style={{ justifyContent: "space-between", fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: "var(--text-3)" }}>Lap {c.laps.length - i}</span>
              <span>{formatDuration(t - (c.laps[i + 1] ?? 0), true)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function StopwatchTile() {
  const dock = useDock();
  const c = useClock(stopwatch);
  return (
    <Tile label="Stopwatch" style={{ gap: 8, padding: "0 10px" }} onClick={(anchor) => dock.toggle("stopwatch", anchor, <StopwatchCard />, 280)}>
      <Stopwatch size={dock.tile * 0.4} color={c.running ? "var(--green)" : undefined} />
      <span style={{ fontSize: dock.tile * 0.28, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatDuration(c.now)}</span>
    </Tile>
  );
}
