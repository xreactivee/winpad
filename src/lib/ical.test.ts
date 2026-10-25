import { describe, expect, it } from "vitest";
import { occurrences, parseDate, parseDuration, parseIcs, unfold } from "./ical";

const cal = (...lines: string[]) => ["BEGIN:VCALENDAR", ...lines, "END:VCALENDAR"].join("\r\n");
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe("parsing", () => {
  it("unfolds lines and unescapes text", () => {
    expect(unfold("SUMMARY:Long\r\n  title\r\nUID:1\n")).toEqual(["SUMMARY:Long title", "UID:1"]);
    const [e] = parseIcs(cal("BEGIN:VEVENT", "UID:a", "SUMMARY:Plan\\, review\\; ship\\nnow", "LOCATION:Room \\\\4", "DTSTART:20261026T090000Z", "END:VEVENT"));
    expect(e.title).toBe("Plan, review; ship\nnow");
    expect(e.location).toBe("Room \\4");
    expect(e.end).toBe(e.start);
  });

  it("reads UTC, floating, zoned and all-day dates", () => {
    expect(parseDate("20261026T090000Z")).toEqual({ ms: Date.UTC(2026, 9, 26, 9), allDay: false });
    expect(parseDate("20261026T090000")).toEqual({ ms: local(2026, 10, 26, 9), allDay: false });
    expect(parseDate("20261026T100000", { TZID: "Europe/Istanbul" })?.ms).toBe(Date.UTC(2026, 9, 26, 7));
    expect(parseDate("20260115T090000", { TZID: "America/New_York" })?.ms).toBe(Date.UTC(2026, 0, 15, 14));
    expect(parseDate("20260715T090000", { TZID: "America/New_York" })?.ms).toBe(Date.UTC(2026, 6, 15, 13));
    expect(parseDate("20261026T090000", { TZID: "Turkey Standard Time" })?.ms).toBe(local(2026, 10, 26, 9));
    expect(parseDate("20261026", { VALUE: "DATE" })).toEqual({ ms: local(2026, 10, 26), allDay: true });
    expect(parseDate("nope")).toBeNull();
  });

  it("reads durations and ignores alarm properties", () => {
    expect(parseDuration("PT1H30M")).toBe(90 * 60_000);
    expect(parseDuration("P1W2D")).toBe(9 * 86_400_000);
    expect(parseDuration("-PT15M")).toBe(-15 * 60_000);
    const [e] = parseIcs(
      cal("BEGIN:VEVENT", "DTSTART:20261026T090000Z", "DURATION:PT45M", "BEGIN:VALARM", "DURATION:PT15M", "SUMMARY:Alarm", "END:VALARM", "SUMMARY:Sync", "END:VEVENT"),
    );
    expect(e.title).toBe("Sync");
    expect(e.end - e.start).toBe(45 * 60_000);
  });

  it("gives all-day events a full day by default", () => {
    const [e] = parseIcs(cal("BEGIN:VEVENT", "UID:h", "DTSTART;VALUE=DATE:20261029", "SUMMARY:Holiday", "END:VEVENT"));
    expect(e.allDay).toBe(true);
    expect(occurrences([e], local(2026, 10, 29, 12), local(2026, 10, 29, 13))).toHaveLength(1);
  });
});

describe("occurrences", () => {
  const range = [local(2026, 10, 1), local(2026, 12, 31)] as const;

  it("expands weekly rules with days, count and exceptions", () => {
    const events = parseIcs(
      cal(
        "BEGIN:VEVENT",
        "UID:standup",
        "SUMMARY:Standup",
        "DTSTART:20261005T100000",
        "DTEND:20261005T101500",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5",
        "EXDATE:20261007T100000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:standup",
        "RECURRENCE-ID:20261012T100000",
        "SUMMARY:Standup (moved)",
        "DTSTART:20261012T113000",
        "DTEND:20261012T114500",
        "END:VEVENT",
      ),
    );
    const got = occurrences(events, ...range);
    expect(got.map((o) => [new Date(o.start).getDate(), new Date(o.start).getHours(), o.title])).toEqual([
      [5, 10, "Standup"],
      [12, 11, "Standup (moved)"],
      [14, 10, "Standup"],
      [19, 10, "Standup"],
    ]);
    expect(got[0].end - got[0].start).toBe(15 * 60_000);
  });

  it("expands daily rules until a date and monthly nth weekdays", () => {
    const events = parseIcs(
      cal(
        "BEGIN:VEVENT",
        "UID:d",
        "DTSTART:20261030T080000",
        "RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261105T235959",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:m",
        "DTSTART:20261013T150000",
        "RRULE:FREQ=MONTHLY;BYDAY=2TU",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:last",
        "DTSTART:20261030T090000",
        "RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=2",
        "END:VEVENT",
      ),
    );
    const got = occurrences(events, ...range);
    const days = (uid: string) => got.filter((o) => o.uid === uid).map((o) => new Date(o.start).toDateString().slice(4, 10));
    expect(days("d")).toEqual(["Oct 30", "Nov 01", "Nov 03", "Nov 05"]);
    expect(days("m")).toEqual(["Oct 13", "Nov 10", "Dec 08"]);
    expect(days("last")).toEqual(["Oct 30", "Nov 27"]);
  });

  it("skips cancelled events and anything outside the range", () => {
    const events = parseIcs(
      cal(
        "BEGIN:VEVENT",
        "UID:c",
        "STATUS:CANCELLED",
        "DTSTART:20261026T090000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:old",
        "DTSTART:20250101T090000",
        "DTEND:20250101T100000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:y",
        "DTSTART:20241102T090000",
        "RRULE:FREQ=YEARLY",
        "END:VEVENT",
      ),
    );
    expect(occurrences(events, ...range).map((o) => [o.uid, new Date(o.start).getFullYear()])).toEqual([["y", 2026]]);
  });
});
