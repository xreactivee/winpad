import { api } from "./api";
import { onSave, useStored } from "./store";

export type HomeView = "pages" | "library" | "window";
export type PhonePanelMode = "open" | "collapsed" | "off";
export type IconStyle = "glass" | "original";
type TempUnit = "c" | "f";

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
};

onSave("settings", (settings) => api.applySettings(settings));

export const useSettings = () => useStored<Settings>("settings", DEFAULT_SETTINGS);

export function useSetting<K extends keyof Settings>(key: K) {
  const [settings, setSettings] = useSettings();
  return [settings[key], (value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }))] as const;
}
