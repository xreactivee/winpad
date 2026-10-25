import { useEffect, useState } from "react";
import { Activity, Sparkles } from "reicon-react";
import { api, type AiWindow, type ScreenDay } from "../../lib/api";
import { useApps } from "../../lib/apps";
import { appForKey, exeName } from "../../lib/dock";
import { usePoll } from "../../lib/hooks";
import { useSetting, useSettings } from "../../lib/settings";
import { shortDuration } from "../../lib/time";
import { AppIcon } from "../../components/AppIcon";
import { newWidget } from "../../widgets/registry";
import { BASE } from "../../widgets/shared";
import { Weather, describe, fetchForecast, type Forecast } from "../../widgets/Weather";
import { useDock } from "../state";
import { Card, MiniRing, Stat, Tile } from "../Tile";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const hm = (seconds: number) => shortDuration(seconds * 1000);

function Bars({ values, labels, highlight }: { values: number[]; labels?: string[]; highlight?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${values.length}, 1fr)`, gap: 3, alignItems: "end", height: 64 }}>
      {values.map((v, i) => (
        <div key={i} style={{ display: "grid", gap: 3, alignItems: "end", height: "100%" }}>
          <div style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0, borderRadius: 3, background: i === highlight ? "var(--accent)" : "rgba(255,255,255,.35)" }} />
          {labels && <span style={{ fontSize: 10, color: "var(--text-3)", textAlign: "center" }}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

function ScreenTimeCard() {
  const days: ScreenDay[] = usePoll(api.screenTime, 60_000) ?? [];
  const apps = useApps();
  const [enabled, setEnabled] = useSetting("screenTime");
  const today = days.at(-1);
  const top = Object.entries(today?.apps ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (!enabled)
    return (
      <Card title="Screen Time">
        <div style={{ color: "var(--text-2)" }}>See where your day goes, by app. It is counted on this PC and never leaves it.</div>
        <button className="btn primary" style={{ justifySelf: "start" }} onClick={() => setEnabled(true)}>
          Turn On Screen Time
        </button>
      </Card>
    );
  return (
    <Card title="Screen Time" action={<span style={{ fontWeight: 650 }}>{hm(today?.total ?? 0)}</span>}>
      <Bars values={today?.hours ?? []} highlight={new Date().getHours()} />
      <div style={{ display: "grid", gap: 6 }}>
        {top.map(([key, secs]) => {
          const app = appForKey(key, apps);
          return (
            <div key={key} className="row" style={{ gap: 10 }}>
              <AppIcon app={app ?? { id: key, name: exeName(key), target: null, icon: null }} size={22} variant="original" />
              <span className="ellipsis" style={{ flex: 1 }}>
                {app?.name ?? exeName(key)}
              </span>
              <span style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{hm(secs)}</span>
            </div>
          );
        })}
        {!top.length && <div style={{ color: "var(--text-3)" }}>Nothing counted yet today</div>}
      </div>
      {days.length > 1 && (
        <Bars
          values={days.map((d) => d.total)}
          labels={days.map((d) => new Date(`${d.date}T12:00`).toLocaleDateString("en-US", { weekday: "narrow" }))}
          highlight={days.length - 1}
        />
      )}
    </Card>
  );
}

export function ScreenTimeTile() {
  const dock = useDock();
  const [enabled] = useSetting("screenTime");
  const days = usePoll(api.screenTime, 60_000) ?? [];
  const total = days.at(-1)?.total ?? 0;
  return (
    <Tile label="Screen Time" style={{ gap: 8, padding: "0 12px" }} onClick={(anchor) => dock.toggle("screenTime", anchor, <ScreenTimeCard />, 340)}>
      <Activity size={dock.tile * 0.4} />
      <span className="dock-sub" style={{ fontSize: dock.tile * 0.28, fontWeight: 600 }}>{enabled ? hm(total) : "Off"}</span>
    </Tile>
  );
}

const pct = (w: AiWindow | null) => (w && (w.resetsAt === null || w.resetsAt > Date.now()) ? w.percent : 0);
const resets = (at: number | null) => (at ? `in ${shortDuration(at - Date.now())}` : "—");

function ClaudeCard() {
  const ai = usePoll(api.aiUsage, 60_000);
  const c = ai?.claude;
  return (
    <Card title="Claude Code">
      {c ? (
        <>
          <Stat label="This session" value={`${compact.format(c.sessionTokens)} tokens`} />
          <Stat label="Session resets" value={resets(c.sessionResetsAt)} />
          <Stat label="Last 7 days" value={`${compact.format(c.weekTokens)} tokens`} />
          {c.topModel && <Stat label="Most used" value={c.topModel} />}
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>Read from Claude Code's history on this PC. Cache reads are not counted.</div>
        </>
      ) : (
        <div style={{ color: "var(--text-3)" }}>Claude Code has no history on this PC yet.</div>
      )}
    </Card>
  );
}

export function ClaudeTile() {
  const dock = useDock();
  const ai = usePoll(api.aiUsage, 60_000);
  const c = ai?.claude;
  return (
    <Tile label="Claude usage" style={{ gap: 8, padding: "0 12px" }} onClick={(anchor) => dock.toggle("claude", anchor, <ClaudeCard />, 300)}>
      <Sparkles size={dock.tile * 0.38} color="#d97757" />
      <span className="dock-sub" style={{ display: "grid", textAlign: "left" }}>
        <span style={{ fontSize: dock.tile * 0.26, fontWeight: 650 }}>{c ? compact.format(c.sessionTokens) : "—"}</span>
        <span style={{ fontSize: dock.tile * 0.2, color: "var(--dock-fg-2)" }}>{c?.sessionResetsAt ? resets(c.sessionResetsAt) : "Claude"}</span>
      </span>
    </Tile>
  );
}

function CodexCard() {
  const ai = usePoll(api.aiUsage, 60_000);
  const x = ai?.codex;
  const row = (label: string, w: AiWindow | null) => (
    <div style={{ display: "grid", gap: 6 }}>
      <Stat label={label} value={`${Math.round(pct(w))}%`} />
      <span className="dock-meter" style={{ width: "100%" }}>
        <i style={{ width: `${pct(w)}%`, background: pct(w) >= 90 ? "var(--red)" : "var(--accent)" }} />
      </span>
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>Resets {resets(w?.resetsAt ?? null)}</span>
    </div>
  );
  return (
    <Card title="ChatGPT (Codex)">
      {x ? (
        <>
          {row("5-hour window", x.primary)}
          {row("Weekly window", x.secondary)}
        </>
      ) : (
        <div style={{ color: "var(--text-3)" }}>Use the Codex CLI once and its limits appear here.</div>
      )}
    </Card>
  );
}

export function CodexTile() {
  const dock = useDock();
  const ai = usePoll(api.aiUsage, 60_000);
  const p = pct(ai?.codex?.primary ?? null);
  return (
    <Tile label="ChatGPT usage" style={{ gap: 8, padding: "0 10px" }} onClick={(anchor) => dock.toggle("codex", anchor, <CodexCard />, 300)}>
      <MiniRing value={p / 100} color={p >= 90 ? "var(--red)" : "var(--green)"}>
        <span style={{ fontSize: dock.tile * 0.2, fontWeight: 650 }}>{Math.round(p)}</span>
      </MiniRing>
      <span className="dock-sub" style={{ fontSize: dock.tile * 0.24, fontWeight: 600 }}>ChatGPT</span>
    </Tile>
  );
}

export function useForecast() {
  const [settings] = useSettings();
  const [data, setData] = useState<Forecast | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchForecast(settings.weatherCity, settings.tempUnit).then((d) => alive && setData(d), () => {});
    void load();
    const id = setInterval(load, 15 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [settings.weatherCity, settings.tempUnit]);
  return data;
}

const noop = () => {};

export function WeatherTile() {
  const dock = useDock();
  const data = useForecast();
  const d = data ? describe(data.code, data.day) : null;
  return (
    <Tile
      label="Weather"
      style={{ gap: 6, padding: "0 12px" }}
      onClick={(anchor) =>
        dock.toggle(
          "weather",
          anchor,
          <div style={{ width: BASE.m.w, height: BASE.m.h, margin: -16, borderRadius: 22, overflow: "hidden" }}>
            <Weather w={newWidget("weather", "m", "sky", "dock-weather")} setOptions={noop} />
          </div>,
          BASE.m.w,
        )
      }
    >
      {d ? <d.Icon size={dock.tile * 0.42} /> : <span />}
      <span style={{ fontSize: dock.tile * 0.3, fontWeight: 600 }}>{data ? `${data.temp}°` : "…"}</span>
    </Tile>
  );
}
