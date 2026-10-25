import { api } from "./api";
import { onSave, useStored } from "./store";

export type HomeView = "pages" | "library" | "window";
export type PhonePanelMode = "open" | "collapsed" | "off";
export type IconStyle = "glass" | "original";
type TempUnit = "c" | "f";
export type DockTaskbar = "autoHide" | "hidden" | "visible";
export type DockEdge = "bottom" | "top";
export type DockWidth = "pill" | "full";
export type DockSize = "s" | "m" | "l";
export type DockStyle = "glass" | "liquid" | "tinted" | "midnight" | "black" | "white" | "clear";

export type Settings = {
  winKey: boolean;
  gridCols: number;
  gridRows: number;
  homeView: HomeView;
  phonePanel: PhonePanelMode;
  iconStyle: IconStyle;
  liquidRefraction: boolean;
  clock24: boolean;
  weatherCity: string;
  tempUnit: TempUnit;
  dock: boolean;
  dockTaskbar: DockTaskbar;
  dockEdge: DockEdge;
  dockWidth: DockWidth;
  dockSize: DockSize;
  dockStyle: DockStyle;
  dockAccent: string;
  dockAutoHide: boolean;
  suppressToasts: boolean;
  dockLocked: boolean;
  dockLabels: boolean;
  screenTime: boolean;
  calendars: string[];
  autoMeeting: boolean;
  autoAiLimit: boolean;
  autoHealth: boolean;
  autoFocusMusic: boolean;
  autoSunset: boolean;
  quietHours: boolean;
  quietFrom: string;
  quietTo: string;
};

export const DEFAULT_SETTINGS: Settings = {
  winKey: true,
  gridCols: 7,
  gridRows: 5,
  homeView: "pages",
  phonePanel: "collapsed",
  iconStyle: "glass",
  liquidRefraction: false,
  clock24: true,
  weatherCity: "Istanbul",
  tempUnit: "c",
  dock: false,
  dockTaskbar: "autoHide",
  dockEdge: "bottom",
  dockWidth: "pill",
  dockSize: "m",
  dockStyle: "glass",
  dockAccent: "#0a84ff",
  dockAutoHide: false,
  suppressToasts: false,
  dockLocked: false,
  dockLabels: true,
  screenTime: false,
  calendars: [],
  autoMeeting: true,
  autoAiLimit: true,
  autoHealth: true,
  autoFocusMusic: false,
  autoSunset: false,
  quietHours: false,
  quietFrom: "22:00",
  quietTo: "08:00",
};

onSave("settings", (settings) => api.applySettings(settings));

export const useSettings = () => useStored<Settings>("settings", DEFAULT_SETTINGS);

export function useSetting<K extends keyof Settings>(key: K) {
  const [settings, setSettings] = useSettings();
  return [settings[key], (value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }))] as const;
}
