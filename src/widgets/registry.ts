import type { Choice } from "../components/controls";
import type { WidgetSize } from "../lib/layout";
import { useStored } from "../lib/store";
import { uid } from "../lib/util";
import { TINTS, ZONES, type Options, type WidgetDef, type WidgetInstance } from "./shared";
import { Clock } from "./Clock";
import { Calendar } from "./Calendar";
import { Weather } from "./Weather";
import { Orb } from "./Orb";
import { BatteryWidget } from "./Battery";
import { SystemWidget } from "./System";
import { NowPlaying } from "./NowPlaying";
import { Notes } from "./Notes";
import { Reminders } from "./Reminders";
import { Photo } from "./Photo";
import { Timer } from "./Timer";
import { Countdown } from "./Countdown";
import { Shortcuts } from "./Shortcuts";

export * from "./shared";

const ORB_STYLES: Choice[] = [
  { value: "sphere", label: "Particle sphere" },
  { value: "working", label: "Orbits" },
  { value: "searching", label: "Scanning sphere" },
  { value: "solving", label: "Unravelling bands" },
  { value: "listening", label: "Wave rings" },
  { value: "connecting", label: "Constellation" },
  { value: "weaving", label: "Weave" },
  { value: "composing", label: "Belt" },
  { value: "breathing", label: "Breathing" },
  { value: "shaping", label: "Shape" },
];

export const WIDGETS: WidgetDef[] = [
  {
    type: "clock",
    name: "Clock",
    description: "Analog, digital, flip, world clocks and time in words",
    sizes: ["s", "m", "l"],
    styles: [
      { value: "analog", label: "Analog" },
      { value: "digital", label: "Digital" },
      { value: "flip", label: "Flip" },
      { value: "world", label: "World clocks" },
      { value: "words", label: "In words" },
    ],
    defaults: { zone: "", face: "light", seconds: true, card: "black", zones: ["Europe/Istanbul", "Europe/London", "America/New_York", "Asia/Tokyo"] },
    fields: [
      { key: "zone", label: "Time zone", type: "select", choices: [{ value: "", label: "Local" }, ...ZONES], styles: ["analog", "digital", "flip", "words"] },
      { key: "face", label: "Dial", type: "select", choices: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }], styles: ["analog"] },
      { key: "card", label: "Cards", type: "select", choices: [{ value: "black", label: "Black" }, { value: "glass", label: "Glass" }], styles: ["flip"] },
      { key: "seconds", label: "Show seconds", type: "toggle", styles: ["analog", "digital", "flip"] },
      { key: "zones", label: "World clock cities", type: "zones", styles: ["world"] },
    ],
    component: Clock,
  },
  {
    type: "calendar",
    name: "Calendar",
    description: "Today's date and a month view",
    sizes: ["s", "m", "l"],
    styles: [
      { value: "date", label: "Date" },
      { value: "month", label: "Month" },
    ],
    defaults: {},
    fields: [],
    component: Calendar,
  },
  {
    type: "weather",
    name: "Weather",
    description: "Current, hourly and 7-day forecast (Open-Meteo)",
    sizes: ["s", "m", "l"],
    styles: [
      { value: "sky", label: "Sky" },
      { value: "glass", label: "Glass" },
    ],
    defaults: { city: "" },
    fields: [{ key: "city", label: "City (empty = the city in Settings)", type: "text" }],
    component: Weather,
  },
  {
    type: "orb",
    name: "Orb",
    description: "Glittering dotted spheres and animated orbs",
    sizes: ["s", "m", "l"],
    styles: ORB_STYLES,
    defaults: { color: "#ffffff", speed: 1, background: "none" },
    fields: [
      {
        key: "color",
        label: "Color",
        type: "color",
        choices: [
          { value: "#ffffff", label: "White" },
          { value: "#9ecbff", label: "Ice" },
          { value: "#bf9bff", label: "Lavender" },
          { value: "#ff9bd2", label: "Pink" },
          { value: "#8dffc4", label: "Mint" },
          { value: "#ffcf8a", label: "Amber" },
        ],
      },
      { key: "speed", label: "Speed", type: "number", min: 0.25, max: 3, step: 0.25 },
      { key: "background", label: "Background", type: "select", choices: [{ value: "none", label: "None (floating)" }, { value: "glass", label: "Glass" }] },
    ],
    component: Orb,
  },
  {
    type: "battery",
    name: "Battery",
    description: "Battery level and charging state",
    sizes: ["s", "m"],
    styles: [{ value: "ring", label: "Ring" }],
    defaults: {},
    fields: [],
    component: BatteryWidget,
  },
  {
    type: "system",
    name: "System",
    description: "CPU, memory, disk and network",
    sizes: ["s", "m", "l"],
    styles: [
      { value: "rings", label: "Rings" },
      { value: "bars", label: "Bars" },
    ],
    defaults: {},
    fields: [],
    component: SystemWidget,
  },
  {
    type: "media",
    name: "Now Playing",
    description: "What's playing, with controls",
    sizes: ["s", "m"],
    styles: [{ value: "art", label: "Artwork" }],
    defaults: {},
    fields: [],
    component: NowPlaying,
  },
  {
    type: "notes",
    name: "Notes",
    description: "A sticky note",
    sizes: ["s", "m", "l"],
    styles: [{ value: "note", label: "Note" }],
    defaults: { text: "", tint: "#ffd60a" },
    fields: [{ key: "tint", label: "Color", type: "color", choices: TINTS }],
    component: Notes,
  },
  {
    type: "reminders",
    name: "Reminders",
    description: "A to-do list",
    sizes: ["s", "m", "l"],
    styles: [{ value: "list", label: "List" }],
    defaults: { title: "Reminders", items: [] },
    fields: [{ key: "title", label: "Title", type: "text" }],
    component: Reminders,
  },
  {
    type: "photo",
    name: "Photos",
    description: "A slideshow from a folder",
    sizes: ["s", "m", "l"],
    styles: [
      { value: "fill", label: "Fill" },
      { value: "framed", label: "Framed" },
    ],
    defaults: { folder: "", interval: 30 },
    fields: [
      { key: "folder", label: "Folder", type: "folder" },
      { key: "interval", label: "Interval (s)", type: "number", min: 5, max: 600, step: 5 },
    ],
    component: Photo,
  },
  {
    type: "timer",
    name: "Timer",
    description: "Countdown timer and stopwatch",
    sizes: ["s", "m"],
    styles: [
      { value: "timer", label: "Timer" },
      { value: "stopwatch", label: "Stopwatch" },
    ],
    defaults: { minutes: 5 },
    fields: [{ key: "minutes", label: "Duration (min)", type: "number", min: 1, max: 180 }],
    component: Timer,
  },
  {
    type: "countdown",
    name: "Countdown",
    description: "Days until an important date",
    sizes: ["s", "m"],
    styles: [{ value: "days", label: "Days" }],
    defaults: { title: "New Year", date: `${new Date().getFullYear() + 1}-01-01`, tint: "#bf5af2" },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "tint", label: "Color", type: "color", choices: TINTS },
    ],
    component: Countdown,
  },
  {
    type: "shortcuts",
    name: "Shortcuts",
    description: "The apps you use most",
    sizes: ["s", "m", "l"],
    styles: [{ value: "grid", label: "Grid" }],
    defaults: { apps: [] },
    fields: [{ key: "apps", label: "Apps", type: "apps" }],
    component: Shortcuts,
  },
];

export const widgetDef = (type: string) => WIDGETS.find((d) => d.type === type);

export function newWidget(type: string, size: WidgetSize, style: string, id = uid("w"), options: Options = {}): WidgetInstance {
  return { id, type, size, style, options: { ...structuredClone(widgetDef(type)!.defaults), ...options }, enabled: true };
}

export function withoutWidget(widgets: Record<string, WidgetInstance>, id: string) {
  const { [id]: _, ...rest } = widgets;
  return rest;
}

const DEFAULT_WIDGETS: Record<string, WidgetInstance> = Object.fromEntries(
  [newWidget("calendar", "s", "date", "lp-calendar"), newWidget("clock", "s", "analog", "lp-clock"), newWidget("orb", "s", "sphere", "lp-orb")].map((w) => [w.id, w]),
);

export const useWidgets = () => useStored<Record<string, WidgetInstance>>("widgets", DEFAULT_WIDGETS);
