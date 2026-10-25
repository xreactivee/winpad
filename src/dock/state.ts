import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Toast } from "../lib/automations";
import { DEFAULT_DOCK, type DockLayout } from "../lib/dock";
import { useNow } from "../lib/hooks";
import { occurrences, parseIcs, type CalEvent, type Occurrence } from "../lib/ical";
import type { DockEdge } from "../lib/settings";
import { useStored } from "../lib/store";

export const useDockLayout = () => useStored<DockLayout>("dock", DEFAULT_DOCK);

export type DockApi = {
  tile: number;
  edge: DockEdge;
  labels: boolean;
  events: Occurrence[];
  openId: string | null;
  toggle: (id: string, anchor: HTMLElement, node: ReactNode, width?: number) => void;
  close: () => void;
  toast: (t: Toast) => void;
  label: (anchor: HTMLElement | null, text?: string) => void;
};

export const DockContext = createContext<DockApi | null>(null);

export function useDock() {
  const dock = useContext(DockContext);
  if (!dock) throw new Error("useDock outside the dock");
  return dock;
}

const CALENDAR_TTL = 15 * 60_000;
const DAY = 86_400_000;
const calendars = new Map<string, { at: number; events: CalEvent[] }>();

export async function loadCalendar(url: string, force = false) {
  const hit = calendars.get(url);
  if (hit && !force && Date.now() - hit.at < CALENDAR_TTL) return hit.events;
  const events = parseIcs(await api.fetchCalendar(url));
  calendars.set(url, { at: Date.now(), events });
  return events;
}

export function useCalendarEvents(urls: string[]): Occurrence[] {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const key = urls.join("\n");
  useEffect(() => {
    let alive = true;
    const list = key ? key.split("\n") : [];
    const load = () =>
      Promise.all(list.map((u) => loadCalendar(u).catch(() => calendars.get(u)?.events ?? []))).then((all) => alive && setEvents(all.flat()));
    void load();
    const id = setInterval(load, CALENDAR_TTL);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [key]);
  const day = useNow(60_000).toDateString();
  return useMemo(() => {
    const start = new Date(day).getTime();
    return occurrences(events, start, start + 35 * DAY);
  }, [events, day]);
}
