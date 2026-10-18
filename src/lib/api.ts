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
export type Battery = { percent: number; charging: boolean };
export type Stats = { cpu: number; memUsed: number; memTotal: number; diskUsed: number; diskTotal: number; netRx: number; netTx: number };
export type Media = { title: string; artist: string; playing: boolean; thumb: string | null };
export type MediaAction = "previous" | "next" | "toggle";
export type Wallpaper = { path: string; version: number };
type PhoneStatus = { icon: string | null; alt: string | null; text: string | null };
export type Phone = { name: string; wallpaper: string | null; frame: string | null; status: PhoneStatus[] };
export type Power = { updates: boolean };
export type PowerAction = "lock" | "signOut" | "sleep" | "shutDown" | "restart" | "updateShutDown" | "updateRestart";

function call<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return inTauri ? invoke<T>(cmd, args) : Promise.resolve(mock(cmd) as T);
}

export const api = {
  listApps: () => call<App[]>("list_apps"),
  launchApp: (id: string) => call("launch_app", { id }),
  openPath: (path: string) => call("open_path", { path }),
  revealApp: (target: string | null) => call("reveal_app", { target }),
  listImages: (dir: string) => call<string[]>("list_images", { dir }),
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
  openSettings: () => call("open_settings"),
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
