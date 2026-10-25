const HOURS = ["twelve", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const MINUTES: Record<number, string> = { 5: "five", 10: "ten", 15: "quarter", 20: "twenty", 25: "twenty-five" };

export type ZonedTime = { h: number; m: number; s: number; date: Date };

export const pad = (n: number) => String(n).padStart(2, "0");

export function zoned(now: Date, zone: string): ZonedTime {
  if (!zone) return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds(), date: now };
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, hour: "numeric", minute: "numeric", second: "numeric" })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => (p.type !== "literal" ? { ...acc, [p.type]: Number(p.value) } : acc), {});
  return { h: parts.hour % 24, m: parts.minute, s: parts.second, date: now };
}

export const displayHour = (h: number, clock24: boolean) => (clock24 ? h : h % 12 || 12);

export const longDate = (date: Date) => date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

export function timeInWords(h: number, m: number) {
  const rounded = Math.round(m / 5) * 5;
  const hour = (h + (rounded === 60 ? 1 : 0)) % 12;
  const mm = rounded % 60;
  if (mm === 0) return `${HOURS[hour]} o'clock`;
  if (mm === 30) return `half past ${HOURS[hour]}`;
  if (mm < 30) return `${MINUTES[mm]} past ${HOURS[hour]}`;
  return `${MINUTES[60 - mm]} to ${HOURS[(hour + 1) % 12]}`;
}

export function daysUntil(dateIso: string, now: Date) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function progress(now: Date, unit: "day" | "month" | "year") {
  const [y, m, d] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const [start, end] =
    unit === "day" ? [new Date(y, m, d), new Date(y, m, d + 1)] : unit === "month" ? [new Date(y, m, 1), new Date(y, m + 1, 1)] : [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
  return (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

export const clockText = (date: Date, clock24: boolean) =>
  `${displayHour(date.getHours(), clock24)}:${pad(date.getMinutes())}${clock24 ? "" : date.getHours() < 12 ? " AM" : " PM"}`;

export function shortDuration(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "<1m";
  const [d, h, m] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export function formatDuration(ms: number, tenths = false) {
  const s = Math.max(0, ms) / 1000;
  const h = Math.floor(s / 3600);
  const base = `${h ? `${h}:` : ""}${pad(Math.floor((s % 3600) / 60))}:${pad(Math.floor(s % 60))}`;
  return tenths ? `${base}.${Math.floor((s * 10) % 10)}` : base;
}
