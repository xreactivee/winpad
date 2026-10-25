import type { Battery, CodexUsage } from "./api";
import type { Occurrence } from "./ical";
import type { Settings } from "./settings";
import { shortDuration } from "./time";

export type Toast = { key: string; title: string; body: string; source: string; calendar?: boolean };

export type AutoAction = { kind: "toast"; toast: Toast } | { kind: "pauseMedia" } | { kind: "theme"; dark: boolean };

export type AutoState = {
  now: number;
  events: Occurrence[];
  playing: boolean;
  codex: CodexUsage | null;
  battery: Battery | null;
  storageFree: number | null;
  sun: { sunrise: number; sunset: number } | null;
  dark: boolean | null;
};

export type AutoSettings = Pick<Settings, "autoMeeting" | "autoAiLimit" | "autoHealth" | "autoSunset" | "quietHours" | "quietFrom" | "quietTo">;

const MEETING_LEAD = 5 * 60_000;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function inQuiet(now: Date, from: string, to: string) {
  const m = now.getHours() * 60 + now.getMinutes();
  const [a, b] = [minutesOf(from), minutesOf(to)];
  if (a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

const dayKey = (t: number) => new Date(t).toDateString();

export function decide(state: AutoState, s: AutoSettings, fired: ReadonlySet<string>) {
  const actions: AutoAction[] = [];
  const keys: string[] = [];
  const quiet = s.quietHours && inQuiet(new Date(state.now), s.quietFrom, s.quietTo);
  const once = (key: string, run: () => void) => {
    if (fired.has(key) || keys.includes(key)) return;
    keys.push(key);
    run();
  };
  const toast = (t: Toast) => {
    if (!quiet) actions.push({ kind: "toast", toast: t });
  };

  if (s.autoMeeting) {
    for (const e of state.events) {
      const lead = e.start - state.now;
      if (e.allDay || lead <= 0 || lead > MEETING_LEAD) continue;
      once(`meet:${e.uid}:${e.start}`, () => {
        toast({ key: `meet:${e.uid}:${e.start}`, title: `${e.title} in ${Math.max(1, Math.round(lead / 60_000))} min`, body: e.location || "Coming up next", source: "Calendar", calendar: true });
        if (state.playing) actions.push({ kind: "pauseMedia" });
      });
    }
  }

  if (s.autoAiLimit && state.codex) {
    const windows = [
      ["primary", "ChatGPT 5-hour limit", state.codex.primary],
      ["secondary", "ChatGPT weekly limit", state.codex.secondary],
    ] as const;
    for (const [id, label, w] of windows) {
      if (!w || w.percent < 90 || (w.resetsAt !== null && w.resetsAt <= state.now)) continue;
      const key = `codex:${id}:${w.resetsAt ?? dayKey(state.now)}`;
      once(key, () =>
        toast({ key, title: `${label} at ${Math.round(w.percent)}%`, body: w.resetsAt ? `Resets in ${shortDuration(w.resetsAt - state.now)}` : "Almost used up", source: "AI limits" }),
      );
    }
  }

  if (s.autoHealth) {
    const b = state.battery;
    if (b && !b.charging && b.percent <= 15) {
      const level = b.percent <= 5 ? 5 : 15;
      const key = `battery:${level}:${dayKey(state.now)}`;
      once(key, () => toast({ key, title: `Battery at ${b.percent}%`, body: "Plug in soon", source: "Health" }));
    }
    if (state.storageFree !== null && state.storageFree < 0.05) {
      const key = `storage:${dayKey(state.now)}`;
      once(key, () => toast({ key, title: "Storage almost full", body: `${Math.round(state.storageFree! * 100)}% free`, source: "Health" }));
    }
  }

  if (s.autoSunset && state.sun && state.dark !== null) {
    const dark = state.now >= state.sun.sunset || state.now < state.sun.sunrise;
    if (dark !== state.dark) {
      const key = `sun:${dayKey(state.now)}:${dark}`;
      once(key, () => {
        actions.push({ kind: "theme", dark });
        toast({ key, title: dark ? "Sunset" : "Sunrise", body: dark ? "Windows switched to dark" : "Windows switched to light", source: "Sunset dark mode" });
      });
    }
  }

  return { actions, keys };
}
