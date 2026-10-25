export type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: number | null;
  byDay: { day: number; nth: number }[];
};

export type CalEvent = {
  uid: string;
  title: string;
  location: string;
  start: number;
  end: number;
  allDay: boolean;
  rule: Rule | null;
  exdates: number[];
  recurrenceId: number | null;
  cancelled: boolean;
};

export type Occurrence = { uid: string; title: string; location: string; start: number; end: number; allDay: boolean };

const DAY = 86_400_000;
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MAX_STEPS = 5000;

export function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else if (line) out.push(line);
  }
  return out;
}

function parseLine(line: string) {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length && colon < 0; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) colon = i;
  }
  const [name, ...rawParams] = line.slice(0, colon < 0 ? line.length : colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: colon < 0 ? "" : line.slice(colon + 1) };
}

const unescape = (v: string) => v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatter(zone: string) {
  if (!formatters.has(zone)) {
    try {
      formatters.set(
        zone,
        new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }),
      );
    } catch {
      formatters.set(zone, null);
    }
  }
  return formatters.get(zone) ?? null;
}

function zoneOffset(at: number, f: Intl.DateTimeFormat) {
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string | undefined) {
  const f = zone ? formatter(zone) : null;
  if (!f) return new Date(y, mo - 1, d, h, mi, s).getTime();
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = wall - zoneOffset(wall, f);
  const second = wall - zoneOffset(first, f);
  return second;
}

export function parseDate(value: string, params: Record<string, string> = {}): { ms: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!m[4] || params.VALUE === "DATE") return { ms: new Date(y, mo - 1, d).getTime(), allDay: true };
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
  if (m[7]) return { ms: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  return { ms: zonedToUtc(y, mo, d, h, mi, s, params.TZID), allDay: false };
}

export function parseDuration(value: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return 0;
  const ms = ((Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * 86_400 + Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)) * 1000;
  return m[1] === "-" ? -ms : ms;
}

function parseRule(value: string): Rule | null {
  const parts = Object.fromEntries(value.split(";").map((p) => p.split("=") as [string, string]));
  const freq = parts.FREQ as Rule["freq"];
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const byDay = (parts.BYDAY ?? "")
    .split(",")
    .map((t) => /^([+-]?\d+)?([A-Z]{2})$/.exec(t.trim()))
    .filter((x): x is RegExpExecArray => !!x && DAYS.includes(x[2]))
    .map((x) => ({ day: DAYS.indexOf(x[2]), nth: Number(x[1] ?? 0) }));
  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until: parts.UNTIL ? (parseDate(parts.UNTIL)?.ms ?? null) : null,
    byDay,
  };
}

export function parseIcs(text: string): CalEvent[] {
  const events: CalEvent[] = [];
  let cur: Partial<CalEvent> & { duration?: number; endSet?: boolean } | null = null;
  let nested = 0;
  for (const line of unfold(text)) {
    const { name, params, value } = parseLine(line);
    if (name === "BEGIN") {
      if (value.toUpperCase() === "VEVENT") cur = { exdates: [], recurrenceId: null, rule: null, cancelled: false, title: "", location: "" };
      else if (cur) nested++;
      continue;
    }
    if (name === "END") {
      if (value.toUpperCase() === "VEVENT" && cur) {
        if (cur.start !== undefined) {
          const end = cur.endSet ? cur.end! : cur.start + (cur.duration ?? (cur.allDay ? DAY : 0));
          events.push({
            uid: cur.uid ?? `${cur.start}-${cur.title}`,
            title: cur.title || "Untitled event",
            location: cur.location ?? "",
            start: cur.start,
            end: Math.max(end, cur.start),
            allDay: !!cur.allDay,
            rule: cur.rule ?? null,
            exdates: cur.exdates ?? [],
            recurrenceId: cur.recurrenceId ?? null,
            cancelled: !!cur.cancelled,
          });
        }
        cur = null;
        nested = 0;
      } else if (cur) nested = Math.max(0, nested - 1);
      continue;
    }
    if (!cur || nested > 0) continue;
    switch (name) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.title = unescape(value);
        break;
      case "LOCATION":
        cur.location = unescape(value);
        break;
      case "DTSTART": {
        const d = parseDate(value, params);
        if (d) [cur.start, cur.allDay] = [d.ms, d.allDay];
        break;
      }
      case "DTEND": {
        const d = parseDate(value, params);
        if (d) [cur.end, cur.endSet] = [d.ms, true];
        break;
      }
      case "DURATION":
        cur.duration = parseDuration(value);
        break;
      case "RRULE":
        cur.rule = parseRule(value);
        break;
      case "EXDATE":
        for (const v of value.split(",")) {
          const d = parseDate(v, params);
          if (d) cur.exdates!.push(d.ms);
        }
        break;
      case "RECURRENCE-ID":
        cur.recurrenceId = parseDate(value, params)?.ms ?? null;
        break;
      case "STATUS":
        cur.cancelled = value.toUpperCase() === "CANCELLED";
        break;
    }
  }
  return events;
}

const withTime = (day: Date, from: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), from.getHours(), from.getMinutes(), from.getSeconds()).getTime();

function nthWeekday(year: number, month: number, day: number, nth: number) {
  if (nth > 0) {
    const first = new Date(year, month, 1).getDay();
    const date = 1 + ((day - first + 7) % 7) + (nth - 1) * 7;
    return date <= new Date(year, month + 1, 0).getDate() ? new Date(year, month, date) : null;
  }
  const lastDate = new Date(year, month + 1, 0);
  const date = lastDate.getDate() - ((lastDate.getDay() - day + 7) % 7) + (nth + 1) * 7;
  return date >= 1 ? new Date(year, month, date) : null;
}

function candidates(start: number, rule: Rule): (step: number) => number[] {
  const s = new Date(start);
  switch (rule.freq) {
    case "DAILY":
      return (k) => [withTime(new Date(s.getFullYear(), s.getMonth(), s.getDate() + k * rule.interval), s)];
    case "WEEKLY": {
      const days = rule.byDay.length ? rule.byDay.map((b) => b.day).sort((a, b) => a - b) : [s.getDay()];
      const weekStart = new Date(s.getFullYear(), s.getMonth(), s.getDate() - s.getDay());
      return (k) => days.map((d) => withTime(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + k * 7 * rule.interval + d), s));
    }
    case "MONTHLY":
      return (k) => {
        const month = new Date(s.getFullYear(), s.getMonth() + k * rule.interval, 1);
        if (rule.byDay.length)
          return rule.byDay
            .map((b) => nthWeekday(month.getFullYear(), month.getMonth(), b.day, b.nth || 1))
            .filter((d): d is Date => !!d)
            .map((d) => withTime(d, s))
            .sort((a, b) => a - b);
        const d = new Date(month.getFullYear(), month.getMonth(), s.getDate());
        return d.getMonth() === month.getMonth() ? [withTime(d, s)] : [];
      };
    case "YEARLY":
      return (k) => {
        const d = new Date(s.getFullYear() + k * rule.interval, s.getMonth(), s.getDate());
        return d.getMonth() === s.getMonth() ? [withTime(d, s)] : [];
      };
  }
}

export function occurrences(events: CalEvent[], from: number, to: number): Occurrence[] {
  const overridden = new Set(events.filter((e) => e.recurrenceId !== null).map((e) => `${e.uid}|${e.recurrenceId}`));
  const out: Occurrence[] = [];
  const add = (e: CalEvent, start: number) => {
    const end = start + (e.end - e.start);
    if (start < to && (end > from || (end === start && start >= from))) out.push({ uid: e.uid, title: e.title, location: e.location, start, end, allDay: e.allDay });
  };
  for (const e of events) {
    if (e.cancelled) continue;
    if (!e.rule || e.recurrenceId !== null) {
      add(e, e.start);
      continue;
    }
    const next = candidates(e.start, e.rule);
    let seen = 0;
    for (let k = 0; k < MAX_STEPS; k++) {
      const batch = next(k).filter((t) => t >= e.start);
      if (batch.length && batch[0] >= to) break;
      let done = false;
      for (const t of batch) {
        if ((e.rule.until !== null && t > e.rule.until) || (e.rule.count !== null && seen >= e.rule.count)) {
          done = true;
          break;
        }
        seen++;
        if (!e.exdates.includes(t) && !overridden.has(`${e.uid}|${t}`)) add(e, t);
      }
      if (done) break;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
