import { useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun, type IconComponent } from "reicon-react";
import { DEFAULT_SETTINGS, useSettings } from "../lib/settings";
import type { WidgetProps } from "./shared";

type Forecast = {
  city: string;
  temp: number;
  code: number;
  day: boolean;
  hourly: { time: string; temp: number; code: number }[];
  daily: { date: string; code: number; max: number; min: number }[];
};

const TTL = 15 * 60_000;
const mem = new Map<string, { at: number; data: Forecast }>();

function describe(code: number, day = true): { label: string; Icon: IconComponent; sky: string } {
  if (code === 0) return { label: "Clear", Icon: day ? Sun : Moon, sky: day ? "#2f7bd8,#7cb8f2" : "#0b1a3a,#29406e" };
  if (code <= 2) return { label: "Partly cloudy", Icon: day ? CloudSun : Moon, sky: day ? "#3b7fc4,#9cbfe0" : "#121c33,#34476b" };
  if (code === 3) return { label: "Overcast", Icon: Cloud, sky: "#55606e,#8c97a5" };
  if (code === 45 || code === 48) return { label: "Foggy", Icon: CloudFog, sky: "#6b7280,#a3a9b3" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", Icon: CloudDrizzle, sky: "#4a5868,#7f8d9d" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Rain", Icon: CloudRain, sky: "#36424f,#64717f" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", Icon: CloudSnow, sky: "#6c7f95,#b6c4d4" };
  if (code >= 95) return { label: "Thunderstorm", Icon: CloudLightning, sky: "#2b2f3a,#535a6b" };
  return { label: "—", Icon: Cloud, sky: "#4a5868,#7f8d9d" };
}

async function fetchForecast(city: string, unit: "c" | "f"): Promise<Forecast> {
  const key = `${city}|${unit}`;
  const hit = mem.get(key) ?? (() => {
    try {
      return JSON.parse(localStorage.getItem("wx:" + key) ?? "null");
    } catch {
      return null;
    }
  })();
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(city)}`).then((r) => r.json());
  const place = geo.results?.[0];
  if (!place) throw new Error("City not found");
  const q = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: "temperature_2m,weather_code,is_day",
    hourly: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: unit === "f" ? "fahrenheit" : "celsius",
  });
  const f = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then((r) => r.json());
  const nowIso = f.current.time.slice(0, 13);
  const start = Math.max(0, f.hourly.time.findIndex((t: string) => t.slice(0, 13) === nowIso));
  const data: Forecast = {
    city: place.name,
    temp: Math.round(f.current.temperature_2m),
    code: f.current.weather_code,
    day: !!f.current.is_day,
    hourly: f.hourly.time.slice(start, start + 6).map((t: string, i: number) => ({
      time: t.slice(11, 16),
      temp: Math.round(f.hourly.temperature_2m[start + i]),
      code: f.hourly.weather_code[start + i],
    })),
    daily: f.daily.time.map((d: string, i: number) => ({
      date: d,
      code: f.daily.weather_code[i],
      max: Math.round(f.daily.temperature_2m_max[i]),
      min: Math.round(f.daily.temperature_2m_min[i]),
    })),
  };
  const entry = { at: Date.now(), data };
  mem.set(key, entry);
  localStorage.setItem("wx:" + key, JSON.stringify(entry));
  return data;
}

export function Weather({ w }: WidgetProps) {
  const [settings] = useSettings();
  const city = (w.options.city || settings.weatherCity || DEFAULT_SETTINGS.weatherCity).trim();
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchForecast(city, settings.tempUnit)
        .then((d) => alive && (setData(d), setError("")))
        .catch((e) => alive && setError(e instanceof Error && e.message === "City not found" ? e.message : "No connection"));
    load();
    const id = setInterval(load, TTL);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [city, settings.tempUnit]);

  const d = data ? describe(data.code, data.day) : null;
  const sky = w.style === "sky" && d ? `linear-gradient(170deg, ${d.sky})` : undefined;
  const today = data?.daily[0];
  return (
    <div style={{ height: "100%", padding: 16, display: "flex", flexDirection: "column", background: sky, color: "#fff" }}>
      {!data ? (
        <div style={{ margin: "auto", color: "var(--text-2)" }}>{error || "Loading…"}</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 650 }}>{data.city}</div>
              <div style={{ fontSize: w.size === "s" ? 44 : 50, fontWeight: 300, lineHeight: 1.05 }}>{data.temp}°</div>
            </div>
            {w.size !== "s" && d && (
              <div style={{ textAlign: "right", display: "grid", justifyItems: "end", gap: 2 }}>
                <d.Icon size={26} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</div>
                {today && <div style={{ fontSize: 13 }}>H:{today.max}° L:{today.min}°</div>}
              </div>
            )}
          </div>
          {w.size === "s" && d && (
            <div style={{ marginTop: "auto", fontSize: 13, fontWeight: 600, display: "grid", gap: 2 }}>
              <d.Icon size={20} />
              <div>{d.label}</div>
              {today && <div>H:{today.max}° L:{today.min}°</div>}
            </div>
          )}
          {w.size !== "s" && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 8, fontSize: 12, fontWeight: 600 }}>
              {data.hourly.map((h, i) => {
                const hd = describe(h.code);
                return (
                  <div key={h.time} style={{ display: "grid", justifyItems: "center", gap: 5 }}>
                    <span style={{ opacity: 0.85 }}>{i === 0 ? "Now" : h.time.slice(0, 2)}</span>
                    <hd.Icon size={18} />
                    <span>{h.temp}°</span>
                  </div>
                );
              })}
            </div>
          )}
          {w.size === "l" && (
            <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,.2)", paddingTop: 8, display: "grid", gap: 5 }}>
              {data.daily.slice(1, 6).map((day) => {
                const dd = describe(day.code);
                return (
                  <div key={day.date} style={{ display: "grid", gridTemplateColumns: "60px 24px 1fr", alignItems: "center", fontSize: 13, fontWeight: 600 }}>
                    <span>{new Date(day.date).toLocaleDateString("en-US", { weekday: "short" })}</span>
                    <dd.Icon size={16} />
                    <span style={{ textAlign: "right" }}>
                      <span style={{ opacity: 0.6 }}>{day.min}°</span> &nbsp; {day.max}°
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
