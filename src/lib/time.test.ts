import { describe, expect, it } from "vitest";
import { clockText, daysUntil, displayHour, formatDuration, progress, shortDuration, timeInWords } from "./time";

describe("timeInWords", () => {
  it("rounds to five minutes and rolls over the hour", () => {
    expect(timeInWords(15, 0)).toBe("three o'clock");
    expect(timeInWords(15, 15)).toBe("quarter past three");
    expect(timeInWords(15, 30)).toBe("half past three");
    expect(timeInWords(15, 45)).toBe("quarter to four");
    expect(timeInWords(6, 5)).toBe("five past six");
    expect(timeInWords(11, 50)).toBe("ten to twelve");
    expect(timeInWords(23, 58)).toBe("twelve o'clock");
  });
});

describe("daysUntil", () => {
  it("counts calendar days", () => {
    const now = new Date(2026, 9, 18, 23, 30);
    expect(daysUntil("2026-10-19", now)).toBe(1);
    expect(daysUntil("2026-10-18", now)).toBe(0);
    expect(daysUntil("2026-10-01", now)).toBe(-17);
  });
});

describe("displayHour", () => {
  it("keeps 24-hour time or folds to 12-hour time", () => {
    expect(displayHour(0, true)).toBe(0);
    expect(displayHour(0, false)).toBe(12);
    expect(displayHour(15, false)).toBe(3);
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds, hours only when needed", () => {
    expect(formatDuration(65_000)).toBe("01:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(1_250, true)).toBe("00:01.2");
    expect(formatDuration(-5)).toBe("00:00");
  });
});

describe("shortDuration", () => {
  it("shows the two largest units", () => {
    expect(shortDuration(30_000)).toBe("<1m");
    expect(shortDuration(45 * 60_000)).toBe("45m");
    expect(shortDuration(160 * 60_000)).toBe("2h 40m");
    expect(shortDuration(120 * 60_000)).toBe("2h");
    expect(shortDuration((3 * 1440 + 5 * 60) * 60_000)).toBe("3d 5h");
  });
});

describe("progress", () => {
  it("measures how much of the day, month and year has passed", () => {
    const now = new Date(2026, 9, 16, 12);
    expect(progress(now, "day")).toBeCloseTo(0.5);
    expect(progress(now, "month")).toBeCloseTo(15.5 / 31);
    expect(progress(new Date(2026, 0, 1), "year")).toBe(0);
  });
});

describe("clockText", () => {
  it("formats 24-hour and 12-hour times", () => {
    expect(clockText(new Date(2026, 0, 1, 9, 5), true)).toBe("9:05");
    expect(clockText(new Date(2026, 0, 1, 0, 30), false)).toBe("12:30 AM");
    expect(clockText(new Date(2026, 0, 1, 15, 0), false)).toBe("3:00 PM");
  });
});
