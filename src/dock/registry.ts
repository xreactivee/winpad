import type { ComponentType } from "react";
import type { TileType } from "../lib/dock";
import { AppsTile, SearchTile, StartTile } from "./tiles/Apps";
import { NotificationsTile } from "./tiles/Notifications";
import { QuickSettingsTile } from "./tiles/QuickSettings";
import { DownloadsTile, RecycleBinTile, ScreenshotsTile } from "./tiles/Files";
import { PomodoroTile, StopwatchTile, TimerTile } from "./tiles/Focus";
import { ClaudeTile, CodexTile, ScreenTimeTile, WeatherTile } from "./tiles/Insights";
import { MediaTile } from "./tiles/Media";
import { BatteryTile, LanguageTile, NetworkTile, StorageTile, SystemTile, TogglesTile, VolumeTile } from "./tiles/System";
import { ClockTile, DateTile, DayProgressTile, MonthProgressTile, NextEventTile, YearProgressTile } from "./tiles/Time";

export type TileDef = { type: TileType; name: string; description: string; category: string; component: ComponentType };

export const TILE_CATEGORIES = ["Taskbar", "Apps & Files", "Time & Calendar", "System", "Media", "Focus", "Insights"] as const;

export const TILES: TileDef[] = [
  { type: "quickSettings", name: "Quick Settings", description: "Wi-Fi, sound and battery, with the full panel", category: "Taskbar", component: QuickSettingsTile },
  { type: "notifications", name: "Notifications", description: "Notification centre with a focus session", category: "Taskbar", component: NotificationsTile },
  { type: "start", name: "Start", description: "Opens WinPad, like the Start button", category: "Apps & Files", component: StartTile },
  { type: "apps", name: "Apps", description: "Pinned apps and every open window", category: "Apps & Files", component: AppsTile },
  { type: "search", name: "Search", description: "Opens WinPad with the search field ready", category: "Apps & Files", component: SearchTile },
  { type: "downloads", name: "Downloads", description: "The latest downloads, one click to open", category: "Apps & Files", component: DownloadsTile },
  { type: "screenshots", name: "Screenshots", description: "Your newest screenshots as thumbnails", category: "Apps & Files", component: ScreenshotsTile },
  { type: "recycleBin", name: "Recycle Bin", description: "What the bin holds, and a click to empty it", category: "Apps & Files", component: RecycleBinTile },
  { type: "clock", name: "Clock", description: "Time and date; a click opens the calendar", category: "Time & Calendar", component: ClockTile },
  { type: "date", name: "Date", description: "Today as a calendar page", category: "Time & Calendar", component: DateTile },
  { type: "nextEvent", name: "Next Event", description: "Your next event and how soon it starts", category: "Time & Calendar", component: NextEventTile },
  { type: "dayProgress", name: "Day Progress", description: "How much of today is behind you", category: "Time & Calendar", component: DayProgressTile },
  { type: "monthProgress", name: "Month Progress", description: "How much of the month is behind you", category: "Time & Calendar", component: MonthProgressTile },
  { type: "yearProgress", name: "Year Progress", description: "How much of the year is behind you", category: "Time & Calendar", component: YearProgressTile },
  { type: "weather", name: "Weather", description: "Temperature now; a click shows the forecast", category: "Time & Calendar", component: WeatherTile },
  { type: "toggles", name: "Quick Toggles", description: "Wi-Fi, Bluetooth, dark mode and keep awake", category: "System", component: TogglesTile },
  { type: "volume", name: "Volume", description: "Scroll to change the volume", category: "System", component: VolumeTile },
  { type: "language", name: "Keyboard Language", description: "The current layout; a click switches it", category: "System", component: LanguageTile },
  { type: "battery", name: "Battery", description: "Charge level and charging state", category: "System", component: BatteryTile },
  { type: "system", name: "CPU & Memory", description: "Processor and memory load as two rings", category: "System", component: SystemTile },
  { type: "network", name: "Network", description: "Download and upload speed", category: "System", component: NetworkTile },
  { type: "storage", name: "Storage", description: "Free space with a usage bar", category: "System", component: StorageTile },
  { type: "media", name: "Now Playing", description: "Cover, title and play or pause", category: "Media", component: MediaTile },
  { type: "pomodoro", name: "Pomodoro", description: "25-minute focus rounds with breaks", category: "Focus", component: PomodoroTile },
  { type: "timer", name: "Timer", description: "A countdown that starts in one click", category: "Focus", component: TimerTile },
  { type: "stopwatch", name: "Stopwatch", description: "Start, pause and lap", category: "Focus", component: StopwatchTile },
  { type: "screenTime", name: "Screen Time", description: "Time in front of the PC, by app", category: "Insights", component: ScreenTimeTile },
  { type: "claude", name: "Claude Usage", description: "Claude Code tokens this session and week", category: "Insights", component: ClaudeTile },
  { type: "codex", name: "ChatGPT Usage", description: "Codex 5-hour and weekly limits", category: "Insights", component: CodexTile },
];

export const tileDef = (type: TileType) => TILES.find((t) => t.type === type);
