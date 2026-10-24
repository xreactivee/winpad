# AGENTS.md

Guidance for AI coding agents working on WinPad. Read this first, then PRD.md (what and why), Architecture.md (how it fits together) and Design-System.md (how it looks and moves).

## What this is

WinPad is a Windows-only Tauri v2 app (Rust + React/TypeScript) that replaces the Start menu with a full-screen, macOS-style Launchpad. The Win key or the Start button opens it; the taskbar search button opens it with the search field focused. It provides pages of apps, icon-sized folders (nestable one level), locked positions, widgets (including interactive orbs), an App Library, a compact Applications window, search across apps plus indexed files and folders, and the Windows account card. A setting picks which of the three views opens. There is deliberately **no** dock, menu bar or desktop widgets; the project used to be a full "WidOS" shell, and those parts were removed. Do not reintroduce them.

## Commands

```bash
npm install
npm run tauri dev          # full app (Vite :1420 + Rust debug build)
npm run dev                # UI only, in a browser, with mock data: http://localhost:1420/?w=launchpad (or ?w=settings)
npm test                   # vitest: src/lib/*.test.ts
npx tsc --noEmit           # type-check
npm run tauri build        # NSIS installer in src-tauri/target/release/bundle/nsis/
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
    time.ts, util.ts     pure helpers (time formatting; clamp, uid, fold, byId, formatBytes)
    *.test.ts            vitest suites, one per pure module; extend them for any logic change
  launchpad/             Launchpad.tsx (state, drag and drop, menus), Grid, Folder, AppLibrary, AppWindow, PhonePanel, PowerButton, AccountButton, SearchBar, FileResults
  widgets/               registry.ts + shared.ts + one component per widget + WidgetFrame/Gallery/Editor
  settings/Settings.tsx  Settings window
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
  account.rs             account card: full name, Microsoft account email, account picture
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

## Testing the real app

- **Scripted input:** run `WINPAD_TEST_INJECTED=1 npm run tauri dev` (debug builds only). The hooks then accept scripted Win presses and clicks from `SendInput`, `keybd_event` or `mouse_event`, so the Win-key and Start-button paths can be driven from a script.
- **Fallback path:** Ctrl+Esc opens Windows' Start without touching the mouse hook, so it exercises the WinEvent fallback.
- **Focus problems:** log `EVENT_SYSTEM_FOREGROUND` changes to see who takes focus and when.
- **Front-end errors:** these show up in the `tauri dev` terminal through Vite's error overlay forwarding.

## Data

- **Store file:** `winpad.json` in `%APPDATA%\dev.winpad.app`. The keys are `settings`, `layout`, `widgets` and `history`.
- **Adding a setting:** add it to `Settings` and `DEFAULT_SETTINGS` in `lib/settings.ts`. Old stores are merged with the defaults automatically.
- **Version:** `package.json` is the single source; `tauri.conf.json` points at it, and Settings imports it.
