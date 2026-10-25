import { describe, expect, it } from "vitest";
import { decide, inQuiet, type AutoSettings, type AutoState } from "./automations";

const ON: AutoSettings = { autoMeeting: true, autoAiLimit: true, autoHealth: true, autoSunset: true, quietHours: false, quietFrom: "22:00", quietTo: "08:00" };
const NOW = new Date(2026, 9, 26, 9, 55).getTime();
const BASE: AutoState = { now: NOW, events: [], playing: false, codex: null, battery: null, storageFree: null, sun: null, dark: null };
const meeting = (minutes: number, allDay = false) => ({ uid: "standup", title: "Standup", location: "", start: NOW + minutes * 60_000, end: NOW + (minutes + 15) * 60_000, allDay });

describe("inQuiet", () => {
  it("handles same-day and overnight ranges", () => {
    expect(inQuiet(new Date(2026, 0, 1, 23, 0), "22:00", "08:00")).toBe(true);
    expect(inQuiet(new Date(2026, 0, 1, 7, 59), "22:00", "08:00")).toBe(true);
    expect(inQuiet(new Date(2026, 0, 1, 8, 0), "22:00", "08:00")).toBe(false);
    expect(inQuiet(new Date(2026, 0, 1, 13, 0), "12:30", "14:00")).toBe(true);
    expect(inQuiet(new Date(2026, 0, 1, 13, 0), "09:00", "09:00")).toBe(false);
  });
});

describe("decide", () => {
  it("warns before a meeting once and pauses the music", () => {
    const state = { ...BASE, events: [meeting(5), meeting(30), meeting(3, true)], playing: true };
    const first = decide(state, ON, new Set());
    expect(first.actions.map((a) => a.kind)).toEqual(["toast", "pauseMedia"]);
    expect(first.actions[0]).toMatchObject({ toast: { title: "Standup in 5 min", calendar: true } });
    expect(decide(state, ON, new Set(first.keys)).actions).toEqual([]);
  });

  it("keeps quiet hours silent but still pauses", () => {
    const got = decide({ ...BASE, events: [meeting(2)], playing: true }, { ...ON, quietHours: true, quietFrom: "09:00", quietTo: "10:00" }, new Set());
    expect(got.actions.map((a) => a.kind)).toEqual(["pauseMedia"]);
    expect(got.keys).toHaveLength(1);
  });

  it("warns about AI limits that have not reset yet", () => {
    const codex = { primary: { percent: 92, minutes: 300, resetsAt: NOW + 160 * 60_000 }, secondary: { percent: 95, minutes: 10080, resetsAt: NOW - 1 }, at: NOW };
    const got = decide({ ...BASE, codex }, ON, new Set());
    expect(got.actions).toEqual([{ kind: "toast", toast: expect.objectContaining({ title: "ChatGPT 5-hour limit at 92%", body: "Resets in 2h 40m" }) }]);
  });

  it("raises health alerts", () => {
    const got = decide({ ...BASE, battery: { percent: 4, charging: false }, storageFree: 0.03 }, ON, new Set());
    expect(got.actions.map((a) => (a.kind === "toast" ? a.toast.title : a.kind))).toEqual(["Battery at 4%", "Storage almost full"]);
    expect(decide({ ...BASE, battery: { percent: 4, charging: true } }, ON, new Set()).actions).toEqual([]);
  });

  it("switches the theme at sunset and sunrise, once each", () => {
    const sun = { sunrise: NOW - 3 * 3_600_000, sunset: NOW + 8 * 3_600_000 };
    expect(decide({ ...BASE, sun, dark: true }, ON, new Set()).actions[0]).toEqual({ kind: "theme", dark: false });
    expect(decide({ ...BASE, sun, dark: false }, ON, new Set()).actions).toEqual([]);
    const evening = decide({ ...BASE, now: sun.sunset + 1, sun, dark: false }, ON, new Set());
    expect(evening.actions[0]).toEqual({ kind: "theme", dark: true });
    expect(decide({ ...BASE, now: sun.sunset + 1, sun, dark: false }, ON, new Set(evening.keys)).actions).toEqual([]);
  });

  it("does nothing when automations are off", () => {
    const off: AutoSettings = { ...ON, autoMeeting: false, autoAiLimit: false, autoHealth: false, autoSunset: false };
    const state = { ...BASE, events: [meeting(1)], battery: { percent: 3, charging: false }, sun: { sunrise: 0, sunset: 1 }, dark: false };
    expect(decide(state, off, new Set())).toEqual({ actions: [], keys: [] });
  });
});
