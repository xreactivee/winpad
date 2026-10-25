# WinPad — Architecture

## Overview

WinPad is a single Tauri v2 process: a Rust core plus a WebView2 front end, Windows only.

```
┌──────────────────────── winpad.exe ────────────────────────┐
│ Rust (src-tauri/src)                                        │
│  keyboard.rs   Win-key LL hook + Start-menu WinEvent hooks  │
│  startbutton.rs LL mouse hook + UIA Start button position   │
│  lib.rs        windows, commands, toggle/refocus Launchpad  │
│  apps.rs       installed apps, icon cache, launching        │
│  files.rs      file/folder search via the Windows index     │
│  shell.rs      focus, wallpaper copy + watcher, COM helper  │
│  system.rs     battery, CPU/RAM/disk/net, media sessions    │
│  phone.rs      Phone Link card -> phone panel data          │
│  power.rs      lock, sign out, sleep, shut down, restart    │
│  update.rs     background self-update from GitHub releases  │
│  account.rs    Windows account card (name, email, picture)  │
│  taskbar.rs    taskbar auto-hide/hide/restore + watchdog    │
│  dock.rs       dock AppBar, placement, window region        │
│  tasks.rs      open windows, window actions, taskbar pins   │
│  controls.rs   volume, radios, theme, keep awake, layouts   │
│  screentime.rs opt-in foreground-app tracker                │
│  ai.rs         Claude Code / Codex usage from local logs    │
│  calendar.rs   iCal download (WinRT HttpClient)             │
│  notifications.rs notification centre (UserNotification…)   │
│        ▲ invoke (commands)          │ emit (events)         │
│        │                            ▼                       │
│ WebView2 windows (same React bundle, picked by label)       │
│  "launchpad"  full-screen, transparent, always on top       │
│  "settings"   frameless window with its own caption buttons │
│  "dock"       transparent, never focused, AppBar on an edge │
└─────────────────────────────────────────────────────────────┘
        │ tauri-plugin-store: winpad.json (settings, layout, widgets, history)
```

All three windows are created hidden at startup and live for the whole session. Closing a window only hides it, so opening Launchpad never waits for a page load. The dock window is shown only while the dock setting is on.

When `winpad.exe` starts with `--taskbar-watchdog <pid> <marker>` or `--restore-taskbar`, `main.rs` handles that before Tauri starts (`winpad_lib::cli`) and exits; see `taskbar.rs` below.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2.12 (`protocol-asset`), plugins: store, autostart, single-instance, dialog, updater |
| Native | Rust 2021, `windows` 0.62 (Win32 + WinRT, including `Devices.Radios`, `Web.Http`, Core Audio, DWM), `sysinfo`, `png` |
| UI | React 19, TypeScript 7, Vite 8, `reicon-react`, `@fontsource-variable/inter`, `thinking-orbs` |
| Tests | Vitest (`src/lib/*.test.ts`: layout, categories, time, dock, ical, automations), `cargo test` (Win-key state machine, junk filter, Phone Link card, file search query and ranking, AI log parsing and blocks, calendar links) |
| Packaging | NSIS, per-user install (`npm run tauri build`), signed updater artifacts (`createUpdaterArtifacts`) |

Dependency versions are pinned exactly in `package.json` and `Cargo.toml`.

## Rust core

### `keyboard.rs` + `startbutton.rs`: how WinPad replaces Start

Each hook gets its own thread and message loop (`hook_thread`). Windows skips a low-level hook that does not answer in time, so nothing else may delay the keyboard and mouse hooks.

**Hard rule:** never call `SendInput` on a hook thread. Windows runs the injected keys through our own low-level hook and waits for it; the hook call times out and Windows silently removes the hook. All injection goes through `send_keys`, which uses a short-lived thread.

1. **Win key: low-level keyboard hook (`WH_KEYBOARD_LL`).**
   - The pure state machine `WinKeyTracker` (unit-tested) decides whether a Win press is a lone tap or part of a shortcut.
   - On a lone tap the hook swallows the real Win-up and injects the unassigned virtual key `0xE8` followed by a replayed Win-up. Windows therefore always sees a key between Win down and up and never opens Start. Then Launchpad toggles.
   - Injected events are ignored by the tracker.
   - **Exception: while WinPad's own window is in the foreground, Windows does not call our low-level hooks at all.** Launchpad handles the Win key in the page instead:
     - on Meta keydown it calls the `mask_win` command, which injects `0xE8` while Win is still held;
     - on a lone Meta keyup it closes.
2. **Start and search buttons: low-level mouse hook (`WH_MOUSE_LL`) in `startbutton.rs`.**
   - Left clicks inside the taskbar's Start button or search button are swallowed (both down and up), so Windows never sees them, and Launchpad toggles. A search button click also focuses Launchpad's search field.
   - The button rectangles come from UI Automation: descendants with AutomationId `StartButton` and `SearchButton` under the taskbar's XAML host, the `Windows.UI.Composition.DesktopWindowContentBridge` child of `Shell_TrayWnd`. That bridge is not a visible Win32 window, so a search from `Shell_TrayWnd` itself does not reach the XAML buttons. A helper thread looks them up.
   - The lookup refreshes, at most every 250ms, while the pointer is near the taskbar:
     - a centred taskbar moves the button as apps open and close;
     - an auto-hidden taskbar only has a button while it is shown.
   - A rectangle older than 5s is not trusted.
3. **Fallback for Ctrl+Esc, touch and anything the mouse hook missed: WinEvent hooks.** The hooks watch `EVENT_SYSTEM_FOREGROUND` and `EVENT_OBJECT_UNCLOAKED`.
   - On current Windows 11 builds the Start surface (`StartMenuExperienceHost.exe`, class `Windows.UI.Core.CoreWindow`) is only uncloaked; the foreground window is `SearchHost.exe`. Older builds make Start itself the foreground window.
   - Either event triggers the same path, debounced to 600ms.
   - The path sends Esc to close Windows' menu, then waits until focus has left Start. Focus also passes through a moment with no foreground window at all, which counts as still closing.
   - Only then does it open Launchpad, because Windows hands focus back to the previous app as its menu closes; opening earlier would lose focus at once.
   - 400ms later `refocus_launchpad` takes focus back once if it was stolen.
   - If Launchpad is already visible when Windows' Start appears, the user meant "close". WinPad closes Windows' menu and Launchpad and does not reopen.
   - Within 1s of our own Win or Start toggle, the fallback only closes Windows' menu.
4. **On/off switch.** `set_enabled` comes from the `winKey` setting. When it is off, all hooks pass everything through.
5. **Testing hook.** Debug builds started with `WINPAD_TEST_INJECTED=1` treat scripted (`SendInput`) Win presses and clicks as real ones, so these paths can be tested automatically.

### `taskbar.rs` + `dock.rs`: the dock and the Windows taskbar

1. **Taskbar modes.** `taskbar::apply(mode)`:
   - Before the first change it saves the taskbar's auto-hide state (`ABM_GETSTATE`) to `%APPDATA%\dev.winpad.app\taskbar-restore.json`. Without that file on disk it changes nothing.
   - **Auto-hide:** `ABM_SETSTATE` with `ABS_AUTOHIDE`.
   - **Hidden:** auto-hide plus `ShowWindowAsync(SW_HIDE)` on every `Shell_TrayWnd` and `Shell_SecondaryTrayWnd`. An `EVENT_OBJECT_SHOW` WinEvent hook (its own `hook_thread`) hides them again when Explorer shows them.
   - **Visible:** restore.
2. **Restore.** `taskbar::restore` shows the tray windows, sets the saved auto-hide state and deletes the file. It runs when the dock is turned off, from `dock::shutdown` (on `RunEvent::Exit` and in `update.rs` before `install`, because the updater exits the process directly), at the next start when the dock is off, from the watchdog and from the NSIS pre-uninstall hook (`--restore-taskbar`).
3. **Watchdog.** The first apply starts `winpad.exe --taskbar-watchdog <pid> <marker>` with `CREATE_NO_WINDOW | DETACHED_PROCESS`. It waits on the WinPad process handle and restores if the file is still there when WinPad dies.
4. **Dock window.** `dock::apply` runs on the main thread:
   - subclasses the `dock` window (`SetWindowSubclass`) and registers it as an AppBar (`ABM_NEW`);
   - reserves the bar's thickness on the chosen edge of the primary monitor (`ABM_QUERYPOS` / `ABM_SETPOS`; nothing when the dock auto-hides);
   - sizes the window to the monitor width and the bar plus a 480px popover band, `HWND_TOPMOST`, without activating it;
   - emits `dock-placed`.
5. **Window region.** `SetWindowRgn` keeps only the visible parts of the window: the front end sends rectangles through `dock_region` (bar, popover, toasts, hover label; the whole window while a context menu is open). The rest of the band passes clicks through to the windows behind.
6. **Notifications.** The subclass handles `ABN_POSCHANGED`, `WM_DISPLAYCHANGE` and `WM_DPICHANGED` (re-place), `ABN_FULLSCREENAPP` (hide or show; ignored for the desktop, `Progman`/`WorkerW`) and `TaskbarCreated` (Explorer restarted: re-register and re-apply the taskbar mode).
7. **Outside clicks.** The window is `focusable: false` (`WS_EX_NOACTIVATE`), so it never gets `blur`. While a popover or menu is open (`dock_popover(true)`), the shared low-level mouse hook calls `dock::on_mouse`; a button press outside the region bounds wakes a worker thread that emits `dock-dismiss`. `startbutton::on_mouse` ignores presses inside the dock.

### `tasks.rs`, `controls.rs`, `screentime.rs`, `ai.rs`, `calendar.rs`

- **Open windows.** `list_windows` walks `EnumWindows` and keeps visible, unowned (or `WS_EX_APPWINDOW`), non-tool, uncloaked (`DWMWA_CLOAKED`) windows with a title, except WinPad's own. Each has the exe path, the AUMID from `SHGetPropertyStoreForWindow` (Store apps live in `ApplicationFrameHost.exe`, so the AUMID names them) and an exe icon from the shared PNG cache. `window_action` focuses (or minimizes the window already in front, or restores a minimized one), minimizes, closes (`WM_CLOSE`) or ends the task (`TerminateProcess`).
- **Controls.** Volume and mute through `IAudioEndpointVolume`; Wi-Fi and Bluetooth through WinRT `Radio`; light or dark through the `Personalize` registry values plus a `WM_SETTINGCHANGE "ImmersiveColorSet"` broadcast; keep awake through a power request (`PowerCreateRequest`, display and system required); keyboard layouts from `GetKeyboardLayoutList`, switched by posting `WM_INPUTLANGCHANGEREQUEST` to the foreground window (the dock never takes focus, so that is the user's app).
- **Screen Time.** One thread, started the first time the setting is on, samples the foreground window every 5 s (AUMID for `ApplicationFrameHost.exe`, else the exe path), skips 2 minutes of idle input (`GetLastInputInfo`) and WinPad itself, and saves 8 days to `screentime.json` every minute.
- **AI usage.** Claude: every `*.jsonl` under `~/.claude/projects` changed in the last week, read incrementally from the last offset; assistant lines are deduplicated by message and request id, tokens are input + output + cache creation, grouped into 5-hour blocks the way `ccusage` does. Codex: the last `rate_limits` record in the newest `~/.codex/sessions` files (both the nested and the older flat shape).
- **Calendars.** `fetch_calendar` accepts only `https://` and `webcal://` (rewritten to https), downloads with WinRT `HttpClient` (system proxy and certificates), and rejects anything over 5 MB. Parsing happens in `lib/ical.ts`.

### `lib.rs`

- **Setup:**
  - reads the shell settings (`winKey`, the dock settings and `screenTime`) from the store and applies them (`apply_stored`);
  - starts the hooks and the wallpaper watcher.
- **`toggle_launchpad`:**
  - if Launchpad is visible, emits `launchpad-close`; the page animates out and hides itself;
  - otherwise it sizes the window to the primary monitor, shows it, brings it to the front with `shell::focus` (the `AttachThreadInput` trick) and emits `launchpad-open`, whose payload says whether to focus the search field (true for the taskbar search button).
- **Single instance:** launching WinPad a second time opens Settings.

### Commands (`invoke`)

All commands are `#[tauri::command(async)]` or `async fn`. Sync Tauri commands run on the main thread, and blocking it froze the whole UI in the WidOS prototype.

| Command | Module | Purpose |
|---|---|---|
| `apply_settings(settings)` | lib | Pushes `winKey` to the hooks and applies the dock, taskbar and Screen Time settings; called on every settings save |
| `mask_win` | keyboard | Launchpad's in-page Win handling (see above) |
| `open_settings(section?)`, `quit_app` | lib | Window control; `section` emits `settings-section` so Settings opens on that page |
| `launchpad_toggle(search)` | lib | The dock's Start and Search tiles |
| `dock_region(rects)`, `dock_popover(open)` | dock | Window region; whether outside clicks should dismiss |
| `list_windows`, `window_action(hwnd, action)`, `taskbar_pins` | tasks | Open windows; `focus`, `minimize`, `close`, `endTask`; names of the taskbar's pinned shortcuts |
| `volume`, `set_volume(level?, muted?)`, `radios`, `set_radio(kind, on)`, `theme`, `set_theme(dark)`, `keep_awake`, `set_keep_awake(on)`, `keyboard_layouts`, `set_keyboard_layout(id)` | controls | Dock tiles |
| `recent_files(folder, count)`, `recycle_bin`, `empty_recycle_bin` | files | Downloads and Screenshots (newest first), Recycle Bin size; emptying shows Windows' own confirmation |
| `screen_time`, `clear_screen_time` | screentime | Up to 8 days of `{ date, total, hours[24], apps }` |
| `ai_usage` | ai | `{ claude: { sessionTokens, sessionResetsAt, weekTokens, topModel }, codex: { primary, secondary, at } }` |
| `fetch_calendar(url)` | calendar | The iCal text |
| `quick_info`, `set_airplane_mode(on)` | controls | Airplane mode, battery-saver status and the Wi-Fi network name |
| `notifications`, `dismiss_notification(id?)` | notifications | `{ allowed, items }`; one notification, or all of them |
| `list_apps` | apps | Start menu's "All apps" (`FOLDERID_AppsFolder`, UWP + Win32), junk filtered, icons cached as PNG in `$APPCACHE/icons` |
| `launch_app(id)` / `open_path(path)` | apps | `ShellExecuteExW` on its own STA thread with `SEE_MASK_NO_CONSOLE` |
| `reveal_app(target)` | apps | Explorer `/select` |
| `list_images(dir)` | apps | Photos widget; also widens the asset-protocol scope |
| `search_files(query)` | files | Up to 10 indexed files and folders `{ name, path, folder, icon }`; icons go through the same PNG cache (one per extension, folder, or `.exe`) |
| `account_info` | account | `{ name, email, picture }`: `NetUserGetInfo` level 23 (full name, SID) and 24 (Microsoft account email); the picture is the `Image192` path under `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AccountPicture\Users\<SID>`, added to the asset-protocol scope |
| `battery`, `sys_stats` | system | Battery widget, System widget |
| `media_info`, `media_control(action)` | system | Now Playing (GSMTC); `action` is `previous`, `next` or `toggle`; the latest artwork is cached to disk |
| `get_wallpaper` | shell | Copies the current wallpaper into the cache so the asset protocol can serve it |
| `phone_info` | phone | Phone panel data, see below |
| `power_info` | power | `{ updates }`: whether Windows has updates waiting for a shut down or restart |
| `power_action(action)` | power | `lock`, `signOut`, `sleep`, `shutDown`, `restart`, `updateShutDown`, `updateRestart` |

### `phone.rs`: phone panel data

- **Source.** Phone Link writes the card Windows 11 shows next to Start to `%LOCALAPPDATA%\Packages\Microsoft.YourPhone_8wekyb3d8bbwe\LocalState\StartMenu\StartMenuCompanion.json`. It is an Adaptive Card.
- **What `parse` takes:**
  - the first top-level `TextBlock` (the phone name);
  - the `ImageSet` above it (lock-screen thumbnail plus phone frame, as data URIs);
  - the first `ColumnSet` after it (the status row's icons, with their localized alt text, and texts such as the battery %).
- **What it ignores.** Everything else, including recent calls.
- **Robustness.** The layout is undocumented. A unit test pins the expected shape, and on any mismatch the panel shows "Connect your phone".
- **Shortcuts.** These are Phone Link deep links opened with `open_path`: `ms-phone:messages`, `ms-phone:calling`, `ms-phone:photos`, `ms-phone:filetransfer`, `ms-phone:` and `ms-phone:settings`.

### `power.rs`: the power menu

- **Updates.** `power_info` reports pending updates when `HKLM\SOFTWARE\Microsoft\WindowsUpdate\Orchestrator\ShutdownFlyoutOptions` is non-zero (the value Windows' own Start menu reads) or the `WindowsUpdate\Auto Update\RebootRequired` key exists.
- **Shut down and restart.** `InitiateShutdownW` after enabling `SeShutdownPrivilege`; the update variants add `SHUTDOWN_INSTALL_UPDATES`. Apps get the normal chance to save or block.
- **Sleep.** Modern Standby PCs (`AoAc`) turn the display off, which is how they enter standby; other PCs call `SetSuspendState`.
- **Lock / sign out.** `LockWorkStation` and `ExitWindowsEx(EWX_LOGOFF)`.
- Every action runs 300ms later on its own thread, so Launchpad can close first.

### `update.rs`: self-update

- Release builds only. A minute after start, then every 6 hours, `tauri-plugin-updater` reads `latest.json` from the latest GitHub release (`plugins.updater.endpoints`).
- A newer version is downloaded and checked against the minisign `pubkey`. Installation waits while Launchpad is visible, then runs the NSIS installer in quiet mode (`/S /UPDATE /R`): WinPad exits, the installer replaces it silently and starts it again.
- `scripts/latest-json.mjs` writes `release/latest.json` (`version`, `pub_date`, `platforms.windows-x86_64.{signature, url}`) from the build's `.sig` file.

### Shared helpers (`shell.rs`)

- `com(f)` runs blocking Win32/WinRT work on the blocking pool with COM initialized (MTA).
- `focus(window)` brings a window to the foreground.
- `cache_dir`, `hash_hex` and `cache_latest` keep the icon, wallpaper and artwork caches; `cache_latest` keeps only the newest file per prefix.

### Events (`emit`, `listen`)

| Event | From → to | Payload |
|---|---|---|
| `launchpad-open` | Rust → launchpad | `boolean`: focus the search field |
| `launchpad-close` | Rust → launchpad | — |
| `wallpaper-changed` | Rust watcher (10s poll) → all | `{ path, version }` |
| `state-changed` | any window → all | `{ key, value, from }`, keeps windows in sync |
| `dock-placed` | Rust → dock | — (the window moved; re-measure) |
| `dock-dismiss` | Rust → dock | — (a click outside the dock: close popovers and menus) |
| `settings-section` | Rust → settings | section key |

## Front end

`src/main.tsx` renders `<Settings>` for the `settings` window, `<Dock>` for `dock` and `<Launchpad>` for everything else. It also mounts the SVG refraction filter and the context-menu host.

### Modules

`src/lib/` holds everything that is not a component. Components never call Tauri directly; they go through `lib/api.ts`.

| Path | Responsibility |
|---|---|
| `lib/api.ts` | The only bridge to Rust and Tauri plugins: typed `api.*` commands (one function per Rust command), `listen` / `emit`, `fileSrc`, `currentWindow`, autostart and the folder picker |
| `lib/mock.ts` | Sample answers for `npm run dev` outside Tauri |
| `lib/store.ts` | Store-backed `useStored(key, default)`, `getStored` / `setStored`, cross-window sync, `onSave` hooks |
| `lib/settings.ts` | `Settings` type, defaults, `useSettings()`, `useSetting(key)`; pushes settings to Rust on save |
| `lib/hooks.ts` | `useNow`, `usePoll(fetch, ms)` (skips hidden documents, dedupes identical answers), `useOutsideClick` |
| `lib/apps.ts` | `useApps`, `refreshApps`, `openApp` (records history), `useHistory`, `useFileSearch` (150ms debounce, drops stale answers) |
| `lib/wallpaper.ts` | `useWallpaper` (pre-blurred copy) and the `frosted` style |
| `lib/layout.ts` | Pure layout logic: packing, pagination, sync, folders, nesting, locks, search |
| `lib/categories.ts` | App name → App Library category (keyword rules, user overrides) and `libraryGroups` |
| `lib/dock.ts` | Pure dock logic: `DockLayout`, item and pin moves, `dockApps` (pins first, then running apps; windows matched to apps by AUMID or exe = `App.target`), `pinsFromTaskbar`, `appForKey` |
| `lib/ical.ts` | Pure iCal: `parseIcs` (folding, escapes, VALARM skipped, UTC / floating / TZID through `Intl`, all-day, DURATION) and `occurrences` (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY incl. nth weekday, EXDATE, RECURRENCE-ID, CANCELLED) |
| `lib/automations.ts` | Pure `decide(state, settings, fired)` → toasts, pause media, theme; `inQuiet` |
| `lib/time.ts` | Pure time helpers: `zoned`, `displayHour`, `longDate`, `timeInWords`, `daysUntil`, `formatDuration`, `shortDuration`, `progress`, `clockText` |
| `lib/util.ts` | `clamp`, `uid`, `fold` (Turkish-aware search folding), `byId`, `formatBytes` |
| `launchpad/` | `Launchpad` (state machine, drag and drop, menus), `Grid`, `Folder` (icon + panel), `AppLibrary` (+ `CategoryView`), `AppWindow`, `PhonePanel` (+ `PhoneToggle`), `PowerButton`, `AccountButton`, `SearchBar`, `FileResults` |
| `widgets/` | `registry.ts` (definitions, `newWidget`, `withoutWidget`, defaults), `shared.ts` (types, sizes, choices), `WidgetFrame`, `WidgetGallery`, `WidgetEditor` (schema-driven form), one file per widget |
| `dock/` | `Dock` (bar, styles, window region, popovers, toasts, labels, drag to reorder, auto-hide, compact mode, automations runner), `state.ts` (`DockContext`/`useDock`, `useDockLayout`, `loadCalendar`, `useCalendarEvents`), `Tile`, `registry.ts` (29 tiles in seven categories), `tiles/*` |
| `settings/Settings.tsx` | Settings window; `TaskbarPane.tsx` is the Taskbar page; `parts.tsx` holds `Card`, `Row`, `ToggleRow`, `Picker` |
| `components/` | `Glass`, `AppIcon`, `AppTile`, `Backdrop`, `ContextMenu`, `Dots`, `Logo`, `Modal`, `controls` (`Switch`, `Segmented`, `Select`, `Slider`, `RoundButton`) |
| `styles/` | Tokens, glass, controls, settings (see Design-System.md) |

### Persistent state (`winpad.json` via tauri-plugin-store)

| Key | Shape |
|---|---|
| `settings` | `Settings` in `lib/settings.ts`: `winKey`, `gridCols`, `gridRows`, `homeView` (`pages` / `library` / `window`), `phonePanel` (`open` / `collapsed` / `off`), `iconStyle`, `liquidRefraction`, `clock24`, `weatherCity`, `tempUnit`. Missing keys are filled from defaults. |
| `layout` | `Layout`: `{ pages: Item[][], hidden: string[], categories: Record<appId, categoryKey> }` |
| `widgets` | `Record<id, WidgetInstance>`: `{ id, type, size, style, options, enabled }` |
| `history` | Last 12 launched app ids (App Library's Recently Opened) |
| `dock` | `DockLayout`: `{ items: { id, type }[], pins: appId[], seeded, version }`; `seeded` records that the taskbar pins were imported once, `version` drives `migrate` (which added the quick settings and notification tiles, and drops tiles that no longer exist). `version` is deliberately absent from `DEFAULT_DOCK`: `getStored` merges a stored record over the defaults, so a default value would hide the missing key |

The dock settings are flat keys in `settings` (`dock`, `dockTaskbar`, `dockEdge`, `dockWidth`, `dockSize`, `dockStyle`, `dockAccent`, `dockAutoHide`, `dockLocked`, `dockLabels`, `screenTime`, `calendars`, `autoMeeting`, `autoAiLimit`, `autoHealth`, `autoFocusMusic`, `autoSunset`, `quietHours`, `quietFrom`, `quietTo`), so the shallow merge with defaults fills them in for older stores. Next to `winpad.json`: `screentime.json`, and `taskbar-restore.json` while the taskbar is changed.

Outside Tauri the same keys go to `localStorage` under the `winpad:` prefix.

### Layout model

```ts
type Pin = { col: number; row: number };                     // locked cell
type Item =
  | { kind: "app"; id: string; pin?: Pin }
  | { kind: "folder"; id: string; name: string; apps: FolderEntry[]; pin?: Pin }
  | { kind: "widget"; id: string; pin?: Pin };
type FolderEntry = string | SubFolder;                        // app id or subfolder
type SubFolder = { kind: "folder"; id: string; name: string; apps: string[] };   // one level only
```

- **`packPage(specs, cols, rows)`:** locked items take their pinned cell first, when it is on the grid and free. Everything else is placed first-fit in reading order. Unlocked items from the first one that does not fit onward overflow.
- **`paginate`:** carries overflow to the next page and drops empty pages. It is idempotent.
- **`syncApps`:** removes uninstalled apps (subfolders included; empty folders vanish) and appends new apps to the last page.
- **Folder operations:** `createFolder`, `addToFolder` (an app, or a folder without subfolders), `mergeInFolder` (subfolders inside a top-level folder), `removeFromFolder` (an app or subfolder out to the grid), `dissolveFolder`, `updateFolder`. Each finds its folder wherever it lives (`whereIs`) and removes folders left empty.
- **Locking:** `setPin` locks or unlocks. The UI forbids dragging locked items and merging into locked apps.

`Launchpad` keeps a normalized copy of the layout (sync → widget sync → paginate) and writes it back when it differs. Every mutation is a pure function applied to that normalized copy.

### Launchpad lifecycle

`phase`: `closed` → `opening` (mounted, invisible) → `open` (two animation frames later, so the zoom-in transition runs) → `closing` → `closed` (the window hides).

- While `closed` the component renders `null`, so widgets, timers and the orb do not run in the background.
- `homeView` picks the content.
  - `pages` and `library` draw the blurred-wallpaper backdrop.
  - `window` draws only the floating `AppWindow`, leaving the rest of the transparent window empty so the desktop shows through.
  - Its frosted look is the pre-blurred wallpaper with `background-attachment: fixed`. The panel is centred by a flex container, because a transform would break fixed backgrounds.
- A window blur closes Launchpad, except within 800ms of opening (the Start path) or while a modal is open.
- The root uses `overflow: clip`, not `hidden`: focusing an element on another page must not scroll the page strip sideways.

### Rendering performance

See Design-System.md, "Performance rules for visuals". In short:

- no filters over animated content;
- a pre-blurred wallpaper;
- only adjacent pages are mounted;
- the orb is capped at 30 fps;
- polling is skipped while hidden.

## Build and run

```bash
npm install
npm run tauri dev      # Vite on :1420 + debug build; Rust changes restart the app
npm run dev            # UI only in a browser with mock data: ?w=launchpad | ?w=settings
npm test               # vitest
npm run tauri build    # src-tauri/target/release/bundle/nsis/WinPad_<version>_x64-setup.exe
```

`cargo test` and `cargo clippy --all-targets` run from `src-tauri/`. Vite ignores `src-tauri/**`, because watching Cargo's locked `target/` caused EBUSY errors.

## Security and privacy

- **CSP:** only self, the asset protocol and IPC, plus `api.open-meteo.com` and `geocoding-api.open-meteo.com`.
- **Updates:** fetched by Rust (not the web view) from GitHub releases and accepted only with a valid signature.
- **Asset protocol:** scope is `$APPCACHE/**` and `$APPDATA/**`. Photo folders the user picks are added at runtime.
- **Capabilities:** `src-tauri/capabilities/default.json` grants the `launchpad`, `settings` and `dock` windows only basic window control (show, hide, close, minimize, maximize, focus, drag) plus the store, autostart and dialog plugins.
- **Taskbar and system settings:** with the dock off, WinPad changes none; the only write outside its own data is the optional autostart Run key. With the dock on, it changes the taskbar's auto-hide state and visibility, always restorable (see `taskbar.rs`). The light/dark theme changes only from the Dark mode toggle or the opt-in Sunset dark mode.
- **Network:** iCal links are downloaded by Rust, never by the web view, and only over https; the CSP is unchanged.
- **Local data read for the dock:** Claude Code and Codex logs in the user's profile (token counts and limit percentages only), and the Downloads and Screenshots folders (the latter is added to the asset scope for thumbnails).
- **Power:** shut down, restart, sleep, lock and sign out run only from a click in the power menu; sign out also from the account panel.
- **Asset protocol additions at runtime:** photo folders the user picks, and the user's own account picture file.
