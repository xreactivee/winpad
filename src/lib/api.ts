import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit as tauriEmit, listen as tauriListen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import { mock } from "./mock";

export const inTauri = "__TAURI_INTERNALS__" in window;
export const currentWindow = inTauri ? getCurrentWebviewWindow() : null;
export const windowLabel: string = currentWindow?.label ?? new URLSearchParams(location.search).get("w") ?? "launchpad";

export type App = { id: string; name: string; target: string | null; icon: string | null };
export type FileHit = { name: string; path: string; folder: boolean; icon: string | null };
export type Account = { name: string; email: string | null; picture: string | null };
export type Battery = { percent: number; charging: boolean };
export type Stats = { cpu: number; memUsed: number; memTotal: number; diskUsed: number; diskTotal: number; netRx: number; netTx: number };
export type Media = { title: string; artist: string; playing: boolean; thumb: string | null };
export type MediaAction = "previous" | "next" | "toggle";
export type Wallpaper = { path: string; version: number };
type PhoneStatus = { icon: string | null; alt: string | null; text: string | null };
export type Phone = { name: string; wallpaper: string | null; frame: string | null; status: PhoneStatus[] };
export type Power = { updates: boolean };
export type PowerAction = "lock" | "signOut" | "sleep" | "shutDown" | "restart" | "updateShutDown" | "updateRestart";
export type Win = { hwnd: number; title: string; exe: string; appId: string | null; icon: string | null; active: boolean; minimized: boolean };
export type WindowAction = "focus" | "minimize" | "close" | "endTask";
export type Volume = { level: number; muted: boolean };
export type RadioKind = "wifi" | "bluetooth";
export type RadioInfo = { kind: RadioKind; on: boolean };
export type KeyboardLayout = { id: number; code: string; name: string };
export type KeyboardLayouts = { current: number; list: KeyboardLayout[] };
export type KnownFolder = "downloads" | "screenshots";
export type RecentFile = { name: string; path: string; icon: string | null; modified: number };
export type RecycleBin = { items: number; bytes: number };
export type ScreenDay = { date: string; total: number; hours: number[]; apps: Record<string, number> };
export type AiWindow = { percent: number; minutes: number | null; resetsAt: number | null };
export type ClaudeUsage = { sessionTokens: number; sessionResetsAt: number | null; weekTokens: number; topModel: string | null };
export type CodexUsage = { primary: AiWindow | null; secondary: AiWindow | null; at: number };
export type AiUsage = { claude: ClaudeUsage | null; codex: CodexUsage | null };
export type QuickInfo = { airplane: boolean; batterySaver: boolean; ssid: string | null };
export type WifiNetwork = { ssid: string; bars: number; secure: boolean; connected: boolean };
export type BluetoothDevice = { name: string; connected: boolean };
export type Notif = { id: number; app: string; appId: string | null; title: string; body: string; icon: string | null; at: number };
export type NotificationFeed = { allowed: boolean; items: Notif[] };

function call<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return inTauri ? invoke<T>(cmd, args) : Promise.resolve(mock(cmd, args) as T);
}

export const api = {
  listApps: () => call<App[]>("list_apps"),
  launchApp: (id: string) => call("launch_app", { id }),
  openPath: (path: string) => call("open_path", { path }),
  revealApp: (target: string | null) => call("reveal_app", { target }),
  listImages: (dir: string) => call<string[]>("list_images", { dir }),
  searchFiles: (query: string) => call<FileHit[]>("search_files", { query }),
  accountInfo: () => call<Account | null>("account_info"),
  phoneInfo: () => call<Phone | null>("phone_info"),
  powerInfo: () => call<Power>("power_info"),
  powerAction: (action: PowerAction) => call("power_action", { action }),
  battery: () => call<Battery | null>("battery"),
  sysStats: () => call<Stats>("sys_stats"),
  mediaInfo: () => call<Media | null>("media_info"),
  mediaControl: (action: MediaAction) => call("media_control", { action }),
  wallpaper: () => call<Wallpaper | null>("get_wallpaper"),
  applySettings: (settings: unknown) => call("apply_settings", { settings }),
  maskWin: () => call("mask_win"),
  openSettings: (section?: string) => call("open_settings", { section: section ?? null }),
  toggleLaunchpad: (search = false) => call("launchpad_toggle", { search }),
  dockRegion: (rects: number[][]) => call("dock_region", { rects }),
  dockPopover: (open: boolean) => call("dock_popover", { open }),
  listWindows: () => call<Win[]>("list_windows"),
  windowAction: (hwnd: number, action: WindowAction) => call("window_action", { hwnd, action }),
  taskbarPins: () => call<string[]>("taskbar_pins"),
  volume: () => call<Volume | null>("volume"),
  setVolume: (level: number | null, muted: boolean | null = null) => call("set_volume", { level, muted }),
  radios: () => call<RadioInfo[]>("radios"),
  setRadio: (kind: RadioKind, on: boolean) => call("set_radio", { kind, on }),
  darkTheme: () => call<boolean>("theme"),
  setDarkTheme: (dark: boolean) => call("set_theme", { dark }),
  keepAwake: () => call<boolean>("keep_awake"),
  setKeepAwake: (on: boolean) => call<boolean>("set_keep_awake", { on }),
  keyboardLayouts: () => call<KeyboardLayouts>("keyboard_layouts"),
  setKeyboardLayout: (id: number) => call("set_keyboard_layout", { id }),
  recentFiles: (folder: KnownFolder, count: number) => call<RecentFile[]>("recent_files", { folder, count }),
  recycleBin: () => call<RecycleBin | null>("recycle_bin"),
  emptyRecycleBin: () => call("empty_recycle_bin"),
  screenTime: () => call<ScreenDay[]>("screen_time"),
  clearScreenTime: () => call("clear_screen_time"),
  aiUsage: () => call<AiUsage>("ai_usage"),
  fetchCalendar: (url: string) => call<string>("fetch_calendar", { url }),
  quickInfo: () => call<QuickInfo>("quick_info"),
  setAirplaneMode: (on: boolean) => call("set_airplane_mode", { on }),
  setBatterySaver: (on: boolean) => call("set_battery_saver", { on }),
  wifiNetworks: () => call<WifiNetwork[]>("wifi_networks"),
  connectWifi: (ssid: string) => call<boolean>("wifi_connect", { ssid }),
  disconnectWifi: () => call("wifi_disconnect"),
  bluetoothDevices: () => call<BluetoothDevice[]>("bluetooth_devices"),
  brightness: () => call<number | null>("brightness"),
  setBrightness: (level: number) => call("set_brightness", { level }),
  notifications: () => call<NotificationFeed>("notifications"),
  dismissNotification: (id: number | null = null) => call("dismiss_notification", { id }),
  quitApp: () => call("quit_app"),
  autostart: () => (inTauri ? isEnabled() : Promise.resolve(false)),
  setAutostart: async (on: boolean) => {
    if (!inTauri) return false;
    await (on ? enable() : disable());
    return isEnabled();
  },
  pickFolder: async () => {
    const dir = inTauri ? await open({ directory: true, multiple: false }) : null;
    return typeof dir === "string" ? dir : null;
  },
};

export const fileSrc = (path: string | null | undefined) => (!path ? "" : inTauri ? convertFileSrc(path) : path);

const local = new EventTarget();

export function listen<T>(event: string, cb: (payload: T) => void): () => void {
  if (!inTauri) {
    const handler = (e: Event) => cb((e as CustomEvent<T>).detail);
    local.addEventListener(event, handler);
    return () => local.removeEventListener(event, handler);
  }
  const off = tauriListen<T>(event, (e) => cb(e.payload));
  return () => void off.then((un) => un());
}

export async function emit(event: string, payload?: unknown) {
  if (inTauri) await tauriEmit(event, payload);
  else local.dispatchEvent(new CustomEvent(event, { detail: payload }));
}
