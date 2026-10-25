import { useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "reicon-react";
import { api } from "../../lib/api";
import { useNow } from "../../lib/hooks";
import type { Occurrence } from "../../lib/ical";
import { useSetting } from "../../lib/settings";
import { clockText, progress, shortDuration } from "../../lib/time";
import { useDock } from "../state";
import { Card, MiniRing, Tile } from "../Tile";

const DAY = 86_400_000;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const onDay = (events: Occurrence[], day: Date) => {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return events.filter((e) => e.start < start + DAY && e.end > start);
};

function EventRow({ e, clock24 }: { e: Occurrence; clock24: boolean }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
      <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: "var(--accent)" }} />
      <div style={{ minWidth: 0 }}>
        <div className="ellipsis" style={{ fontWeight: 600 }}>
          {e.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>
          {e.allDay ? "All day" : `${clockText(new Date(e.start), clock24)} – ${clockText(new Date(e.end), clock24)}`}
          {e.location && ` · ${e.location}`}
        </div>
      </div>
    </div>
  );
}

export function CalendarCard() {
  const { events, close } = useDock();
  const [clock24] = useSetting("clock24");
  const [calendars] = useSetting("calendars");
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const first = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const list = onDay(events, selected);
  return (
    <Card
      title={month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      action={
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-button" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </button>
          <button className="icon-button" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center", fontSize: 12 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{ color: "var(--text-3)", fontWeight: 600 }}>
            {d}
          </div>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={i}
              onClick={() => setSelected(d)}
              style={{
                height: 30,
                borderRadius: 8,
                fontWeight: 600,
                position: "relative",
                background: sameDay(d, selected) ? "var(--fill-strong)" : undefined,
                color: sameDay(d, today) ? "var(--accent)" : undefined,
              }}
            >
              {d.getDate()}
              {onDay(events, d).length > 0 && <span className="dock-dot" style={{ bottom: 3 }} />}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <div style={{ borderTop: "1px solid var(--sep)", paddingTop: 10, display: "grid", gap: 10, maxHeight: 150, overflow: "auto" }} className="scroll">
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>{selected.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}</div>
        {list.length ? list.map((e) => <EventRow key={`${e.uid}${e.start}`} e={e} clock24={clock24} />) : <div style={{ color: "var(--text-3)" }}>No events</div>}
        {!calendars.length && (
          <button
            className="btn small"
            style={{ justifySelf: "start" }}
            onClick={() => {
              close();
              void api.openSettings("taskbar");
            }}
          >
            Add a Calendar…
          </button>
        )}
      </div>
    </Card>
  );
}

function useCalendarToggle() {
  const dock = useDock();
  return (anchor: HTMLElement) => dock.toggle("calendar", anchor, <CalendarCard />, 320);
}

export function ClockTile() {
  const now = useNow(1000);
  const [clock24] = useSetting("clock24");
  const { tile } = useDock();
  const open = useCalendarToggle();
  return (
    <Tile label="Clock" onClick={open} style={{ flexDirection: "column", gap: 0, padding: "0 12px" }}>
      <span style={{ fontSize: tile * 0.34, fontWeight: 650, fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>{clockText(now, clock24)}</span>
      <span className="dock-sub" style={{ fontSize: tile * 0.24, color: "var(--dock-fg-2)", lineHeight: 1.1 }}>{now.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}</span>
    </Tile>
  );
}

export function DateTile() {
  const now = useNow(60_000);
  const { tile } = useDock();
  const open = useCalendarToggle();
  return (
    <Tile label="Date" onClick={open} style={{ flexDirection: "column", gap: 0, width: tile, padding: 0 }}>
      <span style={{ fontSize: tile * 0.2, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", lineHeight: 1.1 }}>{now.toLocaleDateString("en-US", { weekday: "short" })}</span>
      <span style={{ fontSize: tile * 0.42, fontWeight: 650, lineHeight: 1 }}>{now.getDate()}</span>
    </Tile>
  );
}

export function NextEventTile() {
  const { events, tile } = useDock();
  const now = useNow(30_000).getTime();
  const open = useCalendarToggle();
  const next = events.find((e) => !e.allDay && e.end > now);
  const when = !next ? "" : next.start <= now ? "Now" : `in ${shortDuration(next.start - now)}`;
  return (
    <Tile label="Next event" onClick={open} style={{ gap: 8, padding: "0 12px", maxWidth: 220 }}>
      <CalendarIcon size={tile * 0.4} />
      <span style={{ display: "grid", minWidth: 0, textAlign: "left" }}>
        <span className="ellipsis" style={{ fontWeight: 600, fontSize: tile * 0.27 }}>
          {next ? next.title : "No events"}
        </span>
        {next && <span className="dock-sub" style={{ fontSize: tile * 0.23, color: "var(--dock-fg-2)" }}>{when}</span>}
      </span>
    </Tile>
  );
}

function ProgressTile({ unit, label }: { unit: "day" | "month" | "year"; label: (d: Date) => string }) {
  const now = useNow(60_000);
  const { tile } = useDock();
  const value = progress(now, unit);
  return (
    <Tile label={`${unit} progress`} style={{ gap: 8, padding: "0 10px" }}>
      <MiniRing value={value} color="var(--accent)">
        <span style={{ fontSize: tile * 0.22, fontWeight: 650 }}>{Math.floor(value * 100)}</span>
      </MiniRing>
      <span style={{ fontSize: tile * 0.26, fontWeight: 600 }}>{label(now)}</span>
    </Tile>
  );
}

export const DayProgressTile = () => <ProgressTile unit="day" label={() => "Today"} />;
export const MonthProgressTile = () => <ProgressTile unit="month" label={(d) => d.toLocaleDateString("en-US", { month: "short" })} />;
export const YearProgressTile = () => <ProgressTile unit="year" label={(d) => String(d.getFullYear())} />;
