# AGENTS.md

Guidance for AI coding agents working on WinPad. Read this first, then PRD.md (what and why), Architecture.md (how it fits together) and Design-System.md (how it looks and moves).

## What this is

WinPad is a Windows-only Tauri v2 app (Rust + React/TypeScript) that replaces the Start menu with a full-screen, macOS-style Launchpad. The Win key or the Start button opens it; the taskbar search button opens it with the search field focused. It provides pages of apps, icon-sized folders (nestable one level), locked positions, widgets (including interactive orbs), an App Library, a compact Applications window, search across apps plus indexed files and folders, and the Windows account card. A setting picks which of the three views opens.

Since 1.0.0 there is also an **optional dock** (Settings → Taskbar, off by default), inspired by lumabar: a bar on the bottom or top edge with Start, pinned apps and open windows, and live items (clock and iCal calendar, weather, quick toggles, volume, keyboard language, system meters, files, focus timers, Screen Time, Claude and ChatGPT usage) plus automations. While it is on, the Windows taskbar is auto-hidden, hidden or left visible, and it is always restored. There is still **no** menu bar app, desktop widget layer or anything else from the old "WidOS" shell; do not reintroduce those.

## Commands

```bash
npm install
npm run tauri dev          # full app (Vite :1420 + Rust debug build)
npm run dev                # UI only, in a browser, with mock data: http://localhost:1420/?w=launchpad (or ?w=settings, ?w=dock)
npm test                   # vitest: src/lib/*.test.ts
npx tsc --noEmit           # type-check
npm run tauri build        # NSIS installer + .sig in src-tauri/target/release/bundle/nsis/ (needs TAURI_SIGNING_PRIVATE_KEY)
node scripts/latest-json.mjs   # release/latest.json for the updater, after a build
cd src-tauri && cargo test && cargo clippy --all-targets
```

Before reporting work as done, run `npx tsc --noEmit`, `npm test`, and, if Rust changed, `cargo clippy --all-targets` plus `cargo test`. All of them must be clean. Clippy must show no warnings.

Port 1420 is fixed (`strictPort`). If `tauri dev` says the port is in use, another Vite (often a stray preview server) is running. Stop that one; do not change the port.

## Repository map

```
src/                     React front end (one bundle; main.tsx picks the view by window label)
  lib/                   everything that is not a component
    api.ts               the ONLY place that talks to Rust or Tauri plugins (typed api.* commands)
    mock.ts              browser mock answers for npm run dev
    store.ts             useStored(), getStored/setStored, cross-window sync
    settings.ts          Settings type and defaults, useSettings(), useSetting(key)
    hooks.ts             useNow, usePoll(fetch, ms), useOutsideClick
    apps.ts              useApps, refreshApps, openApp, useHistory
    wallpaper.ts         useWallpaper, frosted
    layout.ts            PURE layout logic: packing, pagination, folders, nesting, locks, search
    categories.ts        App Library categories and libraryGroups
    dock.ts              PURE dock logic: items, pins, grouping open windows under apps, taskbar pin import
    ical.ts              PURE iCal parser and recurrence expansion (RRULE, EXDATE, RECURRENCE-ID, TZID)
    automations.ts       PURE automation rules (meeting mode, AI limits, health, sunset, quiet hours)
    time.ts, util.ts     pure helpers (time formatting, progress, shortDuration; clamp, uid, fold, byId, formatBytes)
    *.test.ts            vitest suites, one per pure module; extend them for any logic change
  launchpad/             Launchpad.tsx (state, drag and drop, menus), Grid, Folder, AppLibrary, AppWindow, PhonePanel, PowerButton, AccountButton, SearchBar, FileResults
  dock/                  Dock.tsx (bar, window region, popovers, toasts, drag, compact mode, automations runner), state.ts (context, dock layout, calendars), Tile.tsx, registry.ts, tiles/ (Apps, QuickSettings, Notifications, Time, System, Media, Files, Focus, Insights)
  widgets/               registry.ts + shared.ts + one component per widget + WidgetFrame/Gallery/Editor
  settings/              Settings.tsx (window), parts.tsx (Card, Row, ToggleRow, Picker, DragList), TaskbarPane.tsx
  components/            Glass, AppIcon, AppTile, Backdrop, ContextMenu, Dots, Logo, Modal, controls (Switch, Segmented, Select, Slider, RoundButton)
  styles/                base.css (tokens), glass.css, controls.css, settings.css
src-tauri/src/
  lib.rs                 windows, commands, toggle_launchpad / refocus_launchpad
  keyboard.rs            Win-key hook + Start-menu fallback (WinKeyTracker is unit-tested)
  startbutton.rs         mouse hook that swallows Start and search button clicks; UIA finds the buttons
  apps.rs                installed apps, icon cache, launching
  files.rs               file and folder search through the Windows Search index (OLE DB)
  shell.rs               focus, wallpaper, the com() helper, cache helpers
  system.rs              battery, sys stats, media sessions
  phone.rs               phone panel data from Phone Link's Start-menu card (name, picture, status only)
  power.rs               power menu: pending-update check, lock, sign out, sleep, shut down, restart
  update.rs              background self-update from GitHub releases (release builds only)
  account.rs             account card: full name, Microsoft account email, account picture
  taskbar.rs             Windows taskbar auto-hide/hide/restore, restore marker, watchdog and CLI (--restore-taskbar)
  dock.rs                dock window: AppBar registration, placement, window region, fullscreen, outside clicks
  tasks.rs               open windows (EnumWindows, AUMID), window actions, taskbar pin names
  controls.rs            volume, Wi-Fi/Bluetooth radios and panels, brightness, battery saver, light/dark theme, keep awake, keyboard layouts
  screentime.rs          optional foreground-app tracker (screentime.json)
  ai.rs                  Claude Code and Codex usage from their local logs
  calendar.rs            iCal download (https/webcal only) through WinRT HttpClient
  notifications.rs       notification centre through UserNotificationListener
```

## Rules that matter here

### Performance

The previous version was unusably laggy; these rules fixed it.

- **No blocking on the main thread.** Every Tauri command must be `#[tauri::command(async)]` or `async fn`; sync commands run on the main thread. Use `shell::com(...)` for blocking Win32/COM work.
- **No `filter` or `backdrop-filter` over animated content.** Clocks, the orb and wiggling icons sit under it, so it would re-render every frame.
  - `.glass` has no backdrop blur by design.
  - `frost` is only for small overlays.
  - `liquid` refraction is opt-in.
  - Dim with `opacity`, not with a blur.
- **Nothing runs while Launchpad is closed.** It returns `null` in the `closed` phase.
- **Keep timers cheap.** Canvas animations cap their FPS and check `document.hidden`. Polling goes through `usePoll`, which skips hidden documents and identical answers.
- **The wallpaper blur is a pre-made 160px copy** (`useWallpaper`). The image is loaded with `crossOrigin = "anonymous"`; without it the canvas is tainted and the blur silently fails.

### Layout logic

- **Keep it pure.** Put it in `lib/layout.ts` as pure functions (`Layout → Layout`) with a test. Components only call those functions.
- **Pure modules stay pure.** `lib/layout.ts`, `lib/categories.ts`, `lib/time.ts` and `lib/util.ts` must not import `lib/api.ts` (only `import type`), or vitest breaks on `window`.
- **Locked items (`pin`)** keep their cell and are never moved by reflow, pagination or dragging. Users must unlock first. Never merge into a locked app.
- **Folder depth is limited to two levels:** a folder holds apps and subfolders, and a subfolder holds apps only. `addToFolder` and `mergeInFolder` enforce this. Keep it that way.
- **Folders left empty disappear.** Use the existing helpers (`editEntries` / `whereIs`) rather than walking pages by hand.

### UI

- **UI text is English.** Turkish appears only in categorization keywords and the junk filter, because those match Windows app names. Search folding uses the `tr` locale on purpose, for ı/İ.
- **Only a real tap launches or closes.** Use `tapLaunch` / `isTap()` in Launchpad. Drags and long presses must not.
- **Watch the stacking order.** The full-screen page strip is a later sibling than the search pill, so anything placed over the grid needs an explicit `zIndex`. A missing `zIndex` once made clicks on the search field close Launchpad.
- **Follow Design-System.md** for tokens, radii, motion and interaction thresholds. Reuse `Glass`, `AppIcon`, `AppTile`, `Backdrop`, `openMenu`, `Modal`, the components in `components/controls.tsx` and the classes in `controls.css`; do not restyle a switch, segmented control, slider or select inline.
- **The Launchpad root uses `overflow: clip`.** With `hidden`, focusing something on another page scrolls the whole page strip sideways.

### Start menu replacement (keyboard.rs, startbutton.rs)

- **Never call `SendInput` (or anything slow) on a hook thread.** Windows runs injected input back through our own low-level hook, the call times out, and Windows silently removes the hook. Use `send_keys`, which uses its own thread. Each hook has its own thread.
- **Windows does not call our low-level hooks for input aimed at our own foreground window.** While Launchpad has focus, the Win key is handled in the page: Meta keydown calls `mask_win`, and a lone Meta keyup closes. Keep both paths.
- **Win key path:** swallow only the lone Win-up, then inject `0xE8` and replay the Win-up. Never swallow Win-down, or Win+E and the other shortcuts break.
- **Start and search buttons:** the mouse hook swallows clicks inside the UIA `StartButton` and `SearchButton` rectangles, which refresh while the pointer is near the taskbar. A search button click opens Launchpad with the search field focused.
  - Look the buttons up from the taskbar's `Windows.UI.Composition.DesktopWindowContentBridge` child, not from `Shell_TrayWnd`: that bridge window is not visible to Win32, so UIA does not walk into it from the tray, and on current builds the lookup from `Shell_TrayWnd` finds nothing.
- **Fallback:** this is the WinEvent path: `EVENT_OBJECT_UNCLOAKED` on `StartMenuExperienceHost`'s CoreWindow, plus `EVENT_SYSTEM_FOREGROUND`.
  - It opens Launchpad only after focus has left Start and SearchHost; a missing foreground window counts as still in transit.
  - If Launchpad was already open, it only closes things.
  - Do not "simplify" this into opening immediately: Windows hands focus back to the previous app and Launchpad would close at once.

### Dock and the Windows taskbar (taskbar.rs, dock.rs, src/dock)

- **Always give the taskbar back.** Before the first change, `taskbar::apply` writes the original auto-hide state to `%APPDATA%\dev.winpad.app\taskbar-restore.json`. Every exit path restores from it and deletes it:
  - turning the dock off, and `RunEvent::Exit` (`dock::shutdown`);
  - `update.rs`, before `install` (the updater exits the process without `RunEvent::Exit`);
  - the watchdog: `winpad.exe --taskbar-watchdog <pid> <marker>`, started once, waits for WinPad to die and restores if the marker is still there;
  - the next start (`apply_stored` restores when the dock is off) and the NSIS pre-uninstall hook (`--restore-taskbar`).
  - Never hide the taskbar without the marker on disk.
- **Hidden mode** is auto-hide plus `ShowWindowAsync(SW_HIDE)` on every `Shell_TrayWnd`/`Shell_SecondaryTrayWnd`, and an `EVENT_OBJECT_SHOW` hook hides them again. Use the async call: these windows belong to Explorer.
- **The dock window** (`focusable: false`, so it never takes focus) is an AppBar on the primary monitor, and `SetWindowRgn` limits it to what is on screen (`dock_region`): normally the bar, plus any open popover, toast or label, or the whole window while a context menu is open. Everything else passes clicks through.
  - Keep `DOCK_HEIGHT` in `lib/dock.ts` and `Size::bar` in `dock.rs` in sync.
  - Measure region rectangles with `offsetRect` (it ignores transforms), so `pop-in` animations do not shrink them.
  - Popovers close on outside clicks through the shared mouse hook (`dock::on_mouse` → `dock-dismiss`); the dock never gets focus, so `blur` never fires.
- **Callbacks on the main thread.** AppBar notifications arrive through `SetWindowSubclass` on the dock window: `ABN_POSCHANGED`, `WM_DISPLAYCHANGE`/`WM_DPICHANGED` re-place it, `ABN_FULLSCREENAPP` hides it (the desktop, `Progman`/`WorkerW`, does not count), and `TaskbarCreated` (Explorer restarted) re-registers it and re-applies the taskbar mode. Never hold a lock across a Win32 call that sends messages to the main thread.
- **The Start-button hook ignores clicks inside the dock** (`dock::contains`) and skips the UIA lookup while the taskbar is not visible.
- **Glass** is the pre-blurred wallpaper aligned to the bar's screen position (`window.screenX/Y` + bar rect); no `backdrop-filter` (it cannot see the desktop through a transparent window anyway). Liquid Glass puts the existing `#liquid-glass` filter on the static surface layer only.
- **Tiles poll only while mounted** and go through `usePoll`. `sys_stats` caches for a second and reports network rates per second, so the dock and Launchpad can both poll it.
- **The window is a fixed band, not a fitted box.** It is the bar plus 78% of the monitor height, so a popover never gets clipped. Popovers size themselves from the space the bar leaves (`DOCK_GAP`), never from a constant.
- **Auto-hide:** a 6px `.dock-reveal` strip at the edge brings the bar back on `pointerenter`; never poll `pointermove` over the whole root. The window region keeps the bar's rectangle until the slide-out animation has finished (320ms), or the bar is clipped mid-animation and looks like a stutter.
- **Compact mode.** When the bar would overflow, `data-compact` shrinks padding and hides `.dock-sub` secondary lines. Un-compacting needs 200px of spare row width, so the two states cannot oscillate. The Apps slot is the one that shrinks (`flex: 1 1 auto`, min two tiles) and scrolls inside itself.
- **Notifications** need the user to allow WinPad under Privacy -> Notifications; `allowed: false` is a normal answer, not an error. Dismissing is optimistic in the page (animate out, then call), and puts the row back if the call fails, because the feed only refreshes every few seconds.
  - `RemoveNotification` and `ClearNotifications` answer `0x80070490` (element not found) for an unpackaged app, so WinPad keeps its own dismissed ids in `dismissed.json`, filters the feed through them and prunes the ones Windows has dropped. Trying the WinRT call first is still worth it; its failure is not.
  - A notification cannot be activated the way its toast would be; opening one launches its app by AppUserModelID instead.
- **Windows' own toast banners** are suppressed per app, with `ShowBanner = 0` on every subkey of `HKCU\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings`. That is the backing store for each app's "Show notification banners" checkbox, so the notification still reaches the Action Center and WinPad can show it.
  - The root `NOC_GLOBAL_SETTING_TOASTS_ENABLED` value is **not** the banner switch: setting it to 0 changes the master Notifications toggle and does not stop a single banner. WinPad only restores it to whatever the marker saved.
  - Every original per-app value goes into the restore marker (absent values come back absent), and a 60-second thread re-applies the setting so apps that register later are covered too.
- **The dock has no notification area, on purpose.** Re-hosting Windows' tray was tried and removed in 1.0: current Windows 11 builds keep the icons in a XAML island, the legacy toolbars are empty, and the registry fallback has no window to forward a click to, so neither a real left-click nor a context menu is possible. Windows keeps its own tray; Auto-hide leaves it one nudge away. Do not reintroduce it without a way to click an icon properly.
- **Startup effects wait for the store.** `useStored` returns the default until the key has loaded; effects that migrate or seed stored data (the dock's `migrate`, the taskbar-pin import) check its `ready` flag first. Before that fix they ran on the default layout and wrote it over the user's items and pins on every start.
- **Quick Settings chevrons open a panel inside the card** (Wi-Fi networks, Bluetooth devices, battery, accessibility tools), each with its Settings page as the last row. The dock cannot take focus, so nothing there asks for typing: a Wi-Fi network that needs a password hands over to `ms-availablenetworks:`. Battery saver is switched through the energy-saver threshold (see Architecture.md); keep `battery-saver.json` as the way back.
- **Anything that must keep running belongs to the dock, not to a tile.** A tile is only mounted while the user has it on the bar, so the Pomodoro session runs from `usePomodoroRunner` in `Dock`; the tile only draws it.
- **Privacy.** iCal links are fetched by Rust (https/webcal only) and stay in the settings; AI usage reads only local logs (`~/.claude/projects`, `~/.codex/sessions`); Screen Time is opt-in and stays in `screentime.json`; notifications are read from the running session and never leave the PC.

### File search

- **Source.** `search_files` queries the Windows Search index (`SystemIndex`) over OLE DB, the same index Windows' own search uses. It matches word prefixes in the file name, skips `.lnk` (apps already cover those) and folders whose path contains `node_modules`, `target` or `AppData`.
  - Exclude noise with `NOT CONTAINS(System.ItemFolderPathDisplay, ...)`. `NOT ... LIKE '%x%'` on the path is about 20 times slower (over a second on a developer machine).
  - Read paths from `System.ItemUrl`, not `System.ItemPathDisplay`: the display path is localized (`C:\Kullanıcılar\...`) and cannot be opened.
- **Ranking.** `best_matches` puts exact names first, then names that start with the query, then the rest, keeping the index's most-recent-first order inside each tier. Keep `files::tests` in sync.
- **Web results** are not shown, on purpose.

### Phone panel

- **Data source.** The data comes from Phone Link's `StartMenuCompanion.json`. Read only the name, picture and status row.
  - Never surface recent calls, contacts or messages from that card: the user explicitly declined them.
  - Keep `phone::tests` in sync if the parsing changes.

### Dependencies

- Pin exact versions, and choose releases that are at least two weeks old.
- Do not add a dependency for something a few lines can do.

### Self-update and releases

- **How it works.** `update::watch` checks `https://github.com/xreactivee/winpad/releases/latest/download/latest.json` a minute after start and then every hour. A newer version is downloaded, installed with the NSIS installer in quiet mode (`/S /UPDATE /R`), and WinPad restarts. It never installs while Launchpad is visible. Debug builds never update.
- **Signing.** Updates are verified against the `pubkey` in `tauri.conf.json`. The private key lives outside the repo at `%USERPROFILE%\.tauri\winpad.key` (no password). Never commit it; losing it means installed copies can no longer update. Builds need `TAURI_SIGNING_PRIVATE_KEY` set to that path.
- **Releasing.** Bump the version, build, run `node scripts/latest-json.mjs`, then attach both `release/WinPad_<version>_x64-setup.exe` and `release/latest.json` to the GitHub release `v<version>`. A release without `latest.json` (or a draft or prerelease) is invisible to the updater.

### Power menu

- Power actions run only from a click in the power menu (or Sign Out in the account panel), never from anything else.
- `power_action` acts 300ms later so Launchpad can close first. Keep the action names camelCase on both sides (`PowerAction` in Rust and `lib/api.ts`).

### Code style

- **No comments** in source files (TS, TSX, CSS, Rust, config). The why lives in these Markdown docs; the code should read on its own through names.
- **Names:** camelCase in TypeScript, including data that crosses the IPC boundary. Rust structs sent to the front end use `#[serde(rename_all = "camelCase")]` when a field has more than one word, and enums take camelCase strings. Rust's own identifiers stay snake_case (the compiler warns otherwise), and the Tauri command names stay snake_case strings; they appear only in `lib/api.ts` and `lib/mock.ts`.
- **One place per job.** Before writing a helper, look in `lib/` and `components/`; there is already one for ids (`uid`), clamping, text folding, byte and time formatting, polling, wallpaper, app launching and widget creation or removal.
- Match the surrounding code: concise TypeScript, inline styles with CSS variables for layout, shared classes for anything repeated.
- Delete dead code instead of leaving it around. `tsconfig.json` has `noUnusedLocals` and `noUnusedParameters`, so the compiler reports it.

## Testing in a browser

`npm run dev` (or the "vite" entry in `.claude/launch.json`) serves the UI with mock data from `src/lib/mock.ts`: about 40 fake apps and sample battery, stats, media, phone and power (with updates pending, so the update menu items show). There is no Rust in this mode.

- State lives in `localStorage` under `winpad:*`. Clear those keys to get first-run behavior.
- Window-level behavior cannot be checked here: Win key, Start button, focus and blur, and the real wallpaper. Use `npm run tauri dev` for those.
- `?w=dock` renders the dock once `dock` is on in Settings (`?w=settings` → Taskbar). The window region, AppBar and taskbar hiding only exist in the real app.

## Testing the real app

- **Scripted input:** run `WINPAD_TEST_INJECTED=1 npm run tauri dev` (debug builds only). The hooks then accept scripted Win presses and clicks from `SendInput`, `keybd_event` or `mouse_event`, so the Win-key and Start-button paths can be driven from a script.
- **Fallback path:** Ctrl+Esc opens Windows' Start without touching the mouse hook, so it exercises the WinEvent fallback.
- **Focus problems:** log `EVENT_SYSTEM_FOREGROUND` changes to see who takes focus and when.
- **Front-end errors:** these show up in the `tauri dev` terminal through Vite's error overlay forwarding.

## Data

- **Store file:** `winpad.json` in `%APPDATA%\dev.winpad.app`. The keys are `settings`, `layout`, `widgets`, `history` and `dock` (`{ items, pins, seeded, version }`). `getStored` merges a stored record over the defaults, so a key that exists in the defaults is never missing: a migration flag such as `dock.version` must be left out of `DEFAULT_DOCK`, or `migrate` never runs. The same folder holds `screentime.json` and, while the dock has changed the taskbar, `taskbar-restore.json`.
- **Adding a setting:** add it to `Settings` and `DEFAULT_SETTINGS` in `lib/settings.ts`. Old stores are merged with the defaults automatically.
- **Version:** `package.json` is the single source; `tauri.conf.json` points at it, and Settings imports it.
