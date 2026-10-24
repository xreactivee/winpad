# WinPad — Product Requirements

## Summary

WinPad replaces the Windows 11 Start menu with a macOS-style Launchpad. Pressing the Win key or clicking the taskbar's Start button opens one of three views: a full-screen, blurred-wallpaper overlay with an icon grid, icon-sized folders and widgets; a full-screen App Library of category folders; or a compact floating "Applications" window. Nothing else about Windows changes: the taskbar, desktop and system tray stay as they are.

The visual reference is a short clip of macOS Tahoe's Launchpad, with a "liquid glass" look and a dotted particle orb in the top-right corner.

## Users

- Windows 11 users who prefer the macOS Launchpad to the Start menu: a big, spatial grid they arrange themselves.
- Keyboard users who want Win, type, Enter to launch apps.
- People who want a few glanceable widgets (clock, calendar, weather) without a separate widget board.

## Goals

1. Win key or the Start button opens WinPad instantly. Windows' own Start menu never appears, not even as a flash.
2. Launching an app takes one tap or search plus Enter.
3. The user arranges everything: pages, folders, nested folders, locked positions and widgets.
4. It must feel smooth. Opening, paging and dragging run at display refresh rate, and an idle WinPad uses no meaningful CPU.
5. Zero configuration is needed to get started. The first run shows the user's installed apps, sorted, with a calendar, clock and orb.

## Non-goals

- No dock, menu bar or desktop widgets. These existed in the earlier "WidOS" prototype and were removed on purpose.
- No changes to the taskbar, notification area or Windows theme.
- No cloud sync and no accounts. All data stays local.
- Multi-monitor placement: v1 opens on the primary monitor only.

## Functional requirements

### Opening and closing

- **Opening.** A lone Win key press, or a click on the taskbar's Start button, opens WinPad. Neither shows Windows' Start menu at any point. Ctrl+Esc also opens WinPad, with a brief flash of Windows' menu.
  - A click on the taskbar's search button opens WinPad with its search field focused instead of Windows Search. Win+S still opens Windows Search.
  - If WinPad is already open, the same input closes it, and it never reopens by itself.
  - Win key shortcuts (Win+E, Win+R, Win+D, …) keep working unchanged.
- **Closing.** These close WinPad:
  - Esc, which first closes an open folder, category, search or edit mode, in that order;
  - clicking empty space;
  - launching an app;
  - switching to another window.
- **Settings toggle.** A setting turns Start menu replacement off. When it is off, Windows' Start menu works normally.

### Grid and pages

- **Grid.** Apps, folders and widgets live on a configurable grid: 5–10 columns and 3–7 rows, default 7×5.
  - Items flow in reading order.
  - Whatever does not fit spills onto the next page.
  - Empty pages disappear.
- **Paging.** Change pages with the mouse wheel, touchpad, horizontal swipe, arrow keys or the page dots.
- **Syncing.** Newly installed apps appear on the last page, and uninstalled apps disappear everywhere.
- **Launching.** Only a tap launches an app: a short press without travel. Dragging across icons or holding one never launches anything and never closes WinPad.

### Edit mode

- **Entering.** Long-press an item for about 0.55 s, or right-click and choose Edit.
  - Unlocked icons wiggle.
  - Drag an item to reorder it.
  - Hold near a screen edge to flip pages.
- **Folders from drags.**
  - Dropping an app on an app creates a folder. When both apps share a category, the folder is named after it.
  - Dropping an app on a folder adds it to the folder.
  - Dropping a folder on a folder nests it (see Folders).

### Locking

- **Locking.** Any app, folder or widget can be locked via right-click → Lock Position. A locked item keeps its exact cell:
  - the automatic layout flows other items around it;
  - it is never pushed to another page;
  - it cannot be dragged;
  - nothing can be merged into a locked app.
- **Unlocking.** Right-click → Unlock. Only then can the item move.
- **Edit mode cues.** Locked items show a lock badge and hold still.

### Folders

- **Folder icon.** An icon-sized glass tile showing a 3×3 preview of its contents.
- **Opening.** Tapping a folder opens a centered glass panel. The name can be edited inline.
- **Paging.** The panel shows up to 4×4 items per page; swipe, scroll or use the dots to page.
- **Moving items.** Holding an item for about 0.4 s picks it up. Moving earlier swipes the page instead.
  - Drag within the panel to reorder.
  - Hold near the panel's side to flip pages.
  - Drag past the panel's edge to move the item out to the grid.
- **Nesting.** A folder can contain apps and subfolders, one level deep only. A subfolder holds apps only.
  - Inside a folder, dropping an app on an app makes a subfolder; dropping it on a subfolder adds it.
  - A folder that already contains a subfolder cannot be put inside another folder.
  - Subfolders open in the same panel with a back arrow.
  - A subfolder can be moved out to the grid or ungrouped.
- **Cleanup.** Empty folders and subfolders disappear automatically.

### App Library

- **Groups.** Apps are grouped into Recently Opened, then categories, then Hidden. The categories are Productivity, Utilities, Graphics & Design, Developer Tools, Information & Reading, Music, Entertainment, Social, Photo & Video and Other.
- **Category rules.** Categories are guessed from app names, in English and Turkish. The user can override an app's category via right-click → Change Category.
- **Cards.** Each group is a big glass card with three large icons and a quadrant of four mini icons.
  - A large icon launches its app.
  - The quadrant or any empty card area opens the category in place, with a "‹ Name" header and a full app grid.
- **Home screen setting.** Settings → Launchpad → Opens to picks exactly one view:
  - **Pages** (default): full-screen pages with folders and widgets.
  - **App Library**: full-screen category folders.
  - **Applications window**: a floating glass panel like macOS Tahoe's Applications window.
    - It shows the title, a search field, category chips, recently opened apps, a divider and then all apps.
    - The desktop stays visible around it, with no dim and no blur.
    - The panel itself looks frosted, using the pre-blurred wallpaper.
    - Clicking outside it, or Esc, closes it.

### Phone panel

- **Panel.** A side panel like the one Windows 11 shows next to Start, available in all three views.
  - In Pages and App Library it sits at the right edge, and the grid or library leaves room for it.
  - In the Applications window view it is attached to the right of the window.
- **Content.**
  - The phone linked in Phone Link, with its lock-screen picture and name.
  - The status row: connected, Bluetooth, battery %.
  - Shortcuts: Messages, Calls, Photos, Send files, and Open Phone Link.
  - There is no list of recent calls, on purpose.
- **Setting.** Settings → Launchpad → Phone panel: Open, Button (a small phone button at the top right) or Off.
- **Without Phone Link.** "Connect your phone" appears with a button that starts Phone Link setup.

### Account

- **Button.** A round glass button with the account picture sits in the top-right corner of every view, between the phone button and the power button.
- **Panel.** Like the account card in Windows' Start menu: "Microsoft" with Sign Out on top, then the picture, full name, Microsoft account email and a "My Microsoft Account" link, then Account Settings (`ms-settings:yourinfo`). A local account shows "Local Account" and no email or link.
- The Microsoft 365 and cloud storage rows of Windows' card are left out.

### Updates

- WinPad updates itself in the background: it checks GitHub releases at start and every 6 hours, downloads a newer version, installs it silently and restarts.
- It never installs while WinPad is open on screen.
- Updates must be signed with the project's key; unsigned or tampered downloads are rejected.

### Power menu

- **Button.** A round glass power button sits in the top-right corner of every view, next to the phone button.
- **Options.** Lock, Sign Out, Sleep, Shut Down and Restart.
- **Updates.** When Windows has updates waiting, the button shows an orange dot and the menu adds Update and Shut Down and Update and Restart, the same as Windows' own Start menu.
- Choosing an option closes WinPad first. Apps with unsaved work get the usual chance to block a shut down.

### Search

- Typing anywhere starts a search, and clicking the search field works too.
- Matching is accent- and Turkish-casing-aware. Prefix matches come first, then word-start matches, then substring matches.
- Arrow keys move the selection and Enter launches. Hidden apps are excluded.
- **Files and folders.** Below the apps, up to 10 files and folders from the Windows Search index, the same index Windows' own search uses: icon, name and containing folder.
  - Exact names come first, then names starting with the query, then other word matches, newest first.
  - Build and dependency folders (`node_modules`, `target`) and `AppData` are left out; so are shortcuts, which the app list already covers.
  - Enter or a click opens the item; right-click offers Open and Show in Explorer.
  - No web results.

### Widgets

- **Sizes.** Small (2×2 cells), Medium (4×2) and Large (4×4). They live on Launchpad pages, are added from a gallery, and are edited through a generic form.
- **Types:**

  | Widget | Styles and options |
  |---|---|
  | Clock | Analog, digital, flip (black or glass cards), world clocks, time in words |
  | Calendar | Date card, month view |
  | Weather | Open-Meteo, no API key, 15-minute cache, °C or °F |
  | Orb | Particle sphere plus nine thinking-orbs animations |
  | Battery | — |
  | System | CPU, memory, disk, network |
  | Now Playing | Uses Windows media sessions |
  | Notes | — |
  | Reminders | — |
  | Photos | Folder slideshow |
  | Timer | Countdown timer or stopwatch |
  | Countdown | Days until a date |
  | Shortcuts | Chosen apps |

- **Visibility.** Widgets can be turned off without deleting them (Settings → Widgets).
- **Orbs react to the mouse, each in its own way.** In edit mode the pointer moves the widget instead.

  | Orb | Interaction |
  |---|---|
  | Particle sphere | Grab it to spin it in any direction; it keeps its momentum and settles back |
  | Orbits | A flick spins them faster |
  | Scanning globe | Spinning it speeds up the scan |
  | Bands | Click to scramble |
  | Waves | They swell as the pointer approaches; press to make them louder |
  | Constellation | Links reach further as the pointer approaches; click sends a burst of signals |
  | Plait | Drag up or down to twist it tighter or looser |
  | Sash | Drag to make it wobble and spin |
  | Ring | Press and hold to inhale, let go to exhale |
  | Outline | Click to step circle → triangle → square → morphing |

  All of them except the ring tilt in 3D while dragged.

### Context menus

- **App:** Open, Show in Explorer, Change Category, Remove from Folder (inside folders), Lock or Unlock, Hide or Unhide, Uninstall (opens Windows Settings), Edit.
- **Folder:** Open, Lock or Unlock, Ungroup Folder, Edit.
- **Subfolder:** Open, Remove from Folder, Ungroup Folder.
- **Widget:** Edit Widget, Size, Lock or Unlock, Remove Widget, Add Widget, Edit.
- **Background:** Add Widget, Edit, WinPad Settings.

### Settings window

- **Look.** The same glass language as Launchpad: the blurred desktop wallpaper behind a floating glass sidebar and glass cards, with Windows caption buttons.
- **General:** replace Start with WinPad; start with Windows; a keyboard shortcut reference.
- **Launchpad:**
  - which view opens, picked from three miniature previews (Pages, App Library or Applications window);
  - grid columns and rows, with a live preview;
  - the phone panel (Open, Button or Off);
  - icon style (glass squircle or original), shown with a real app icon;
  - liquid glass refraction (off by default; heavy on the CPU);
  - 24-hour clocks;
  - reset layout.
- **Widgets:** cards with a live preview; enable or disable, edit, delete, add.
- **Weather:** a live forecast preview, default city and unit.
- **About:** logo, version, credits and Quit.
- **Opening it:** the Settings window opens from the background context menu, or by launching WinPad a second time.

## Quality requirements

- **Performance:**
  - Nothing renders while WinPad is closed.
  - No CSS `filter` or `backdrop-filter` sits over animated content. The wallpaper blur is a pre-blurred image.
  - Native commands never block the UI thread.
  - The orb is capped at 30 fps.
- **Startup:** the WinPad window is created hidden at login and shown on demand, so opening is instant.
- **Robustness:** a crash must never leave Windows unusable. WinPad does not hide or modify the taskbar.
- **Privacy:**
  - File search reads only the local Windows Search index.
  - The only network calls go to Open-Meteo, with the city name only, and to GitHub releases for updates.
  - The phone panel reads Phone Link's local Start-menu card, and only the phone's name, picture and status row. Contacts and calls in that card are never read into WinPad.
- **Language:** the UI is in English. App-name matching also understands Turkish app names.

## Known limitations

- Primary monitor only.
- When an elevated (administrator) window has focus, the low-level keyboard hook cannot see the Win key, so Windows' Start opens instead (UIPI).
- Start and search button clicks are recognized through the taskbar's UI Automation elements `StartButton` and `SearchButton`, primary taskbar only. The search box style of the taskbar search is untested. If that lookup fails, the fallback watches Windows' own processes (`StartMenuExperienceHost.exe` / `SearchHost.exe`) and shows a brief flash of Windows' menu. A future Windows redesign may require an update.
- Unsigned installer, so SmartScreen warns on first run.

## Success criteria

- The Win key and the Start button open WinPad 100% of the time when the setting is on, and Windows' Start menu never remains visible.
- Opening, paging and drag feedback stay smooth on a mid-range laptop, with idle CPU near 0%.
- The user can rebuild their personal layout (folders, nested folders, locks, widgets) without ever editing files.
