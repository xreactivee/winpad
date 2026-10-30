# WinPad — Product Requirements

## Summary

WinPad replaces the Windows 11 Start menu with a macOS-style Launchpad. Pressing the Win key or clicking the taskbar's Start button opens one of three views: a full-screen, blurred-wallpaper overlay with an icon grid, icon-sized folders and widgets; a full-screen App Library of category folders; or a compact floating "Applications" window.

Since 1.0.0 WinPad can also customize the taskbar: an optional dock on the bottom or top edge holds Start, pinned apps, open windows and live items, while the Windows taskbar is auto-hidden, hidden or left alone. The feature is modeled on lumabar (lumabar.xyz), a paid smart dock; WinPad takes its ideas, not its code. It is off by default, so out of the box nothing about the taskbar, desktop or system tray changes.

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

- No menu bar app or desktop widget layer. These existed in the earlier "WidOS" prototype and were removed on purpose. The 1.0 dock is the one exception, and it is opt-in.
- No permanent changes to the taskbar or notification area. The dock only changes the taskbar while it runs, and Windows gets it back as it was. The theme changes only through the opt-in Dark mode toggle and Sunset dark mode.
- No cloud sync and no accounts. All data stays local. The dock connects to nothing that needs a key or a sign-in: no revenue, social or mail integrations.
- Multi-monitor placement: Launchpad and the dock use the primary monitor only.

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

- WinPad updates itself in the background: it checks GitHub releases at start and every hour, downloads a newer version, installs it silently and restarts.
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

### Taskbar (dock)

- **Switch.** Settings → Taskbar → Use the WinPad dock. Off by default.
- **Windows taskbar.** While the dock is on: Auto-hide (default; the taskbar and its notification area slide up when the pointer reaches the edge), Hidden (never shown) or Visible (the dock sits next to it). It is restored when the dock is turned off, when WinPad quits or updates, after a crash (a watchdog process and a marker file), at the next start and on uninstall.
- **Placement.** Bottom or top edge of the primary monitor, floating (centered) or full width, sizes S, M and L (44, 54 and 64 px bars). Maximized windows make room for it (AppBar), except when the dock auto-hides. It hides itself while an app is full screen.
- **Behavior.** Optional auto-hide (slides away, returns when the pointer touches the edge), Lock (no dragging) and names on hover. When the items no longer fit, the dock turns compact: the apps shrink first, then captions give way to icons. Unlocked items can be dragged along the dock. Right-click: remove an item, Add Item…, Lock Dock, Dock Settings….
- **Looks.** Glass, Liquid Glass, iOS Glass, Midnight, Black, White and Clear, nine accent colors.
- **Items** (added from a gallery in Settings, any order):

  | Group | Items |
  |---|---|
  | Taskbar | Quick Settings, Notifications |
  | Apps & Files | Start (opens WinPad), Apps (pinned apps and open windows), Search (WinPad with search focused), Downloads, Screenshots, Recycle Bin |
  | Time & Calendar | Clock, Date, Next Event, Day / Month / Year Progress, Weather; clocks and dates open a month calendar with events |
  | System | Quick Toggles (Wi-Fi, Bluetooth, dark mode, keep awake), Volume (scroll to change), Keyboard Language, Battery, CPU & Memory, Network, Storage |
  | Media | Now Playing |
  | Focus | Pomodoro (25/5), Timer, Stopwatch with laps |
  | Insights | Screen Time, Claude usage, ChatGPT (Codex) usage |

- **Apps.** Taskbar pins are imported once; Launchpad's app menu adds Pin to Dock / Unpin from Dock. A click starts a pinned app, switches to its window, minimizes it when it is already in front, or lists its windows when it has several. Middle-click opens a new window. The menu has Open / New Window, Pin or Unpin, Show in Explorer, Close Window(s) and End Task.
- **Quick Settings.** A panel like the one the taskbar opens: Wi-Fi (with the network name, or "Not connected"), Bluetooth, airplane mode, accessibility, dark mode, keep awake and battery saver (which turns battery saver on and off), volume and brightness sliders, the battery level and a button for all settings. The chevrons open a panel in the same card: nearby Wi-Fi networks to join, paired Bluetooth devices, the battery, or the accessibility tools, each ending in a link to its Settings page.
- **Notifications.** A notification centre: every app's notifications grouped by app, newest first, dismissed one at a time or all at once, with the quiet-hours switch and a focus session starter beside today's date. Clicking one opens the app it came from. Windows asks for permission once, under Privacy → Notifications.
- **Windows banners.** An optional switch turns off "Show notification banners" for every app, so toasts stop popping up in the corner and the dock's notification centre is the only place they appear. Notifications still arrive. Apps that register later are covered within a minute, and every app's original choice is put back when the dock is off or WinPad quits.
- **Calendars.** Secret iCal links (Google, Outlook, iCloud; https or webcal), read every 15 minutes, read-only. Recurring events, exceptions and time zones are expanded locally.
- **Automations,** each one switch: Meeting mode (reminder and paused music 5 minutes before an event), AI limit alerts (Codex limit at 90% or more), Health alerts (battery at 15% or less, storage under 5% free), Focus music (a Pomodoro focus round starts the music), Sunset dark mode (dark at sunset, light at sunrise, for the weather city). Quiet hours silence the reminders.
- **Screen Time.** Opt-in. Every 5 seconds the app in front is counted unless the PC has been idle for 2 minutes; days, hours and apps are kept for 8 days on this PC.

### Context menus

- **App:** Open, Show in Explorer, Pin to Dock or Unpin from Dock (while the dock is on), Change Category, Remove from Folder (inside folders), Lock or Unlock, Hide or Unhide, Uninstall (opens Windows Settings), Edit.
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
- **Taskbar:** the dock switch and the Windows taskbar mode; position (two miniature previews), width, size, auto-hide, lock, names on hover; style (seven previews), accent color, 24-hour time; items (drag to reorder, remove, Add Item… gallery); pinned apps (drag to reorder, remove, Import Taskbar Pins); calendars (add an iCal link, with a live event count or error); automations and quiet hours; Screen Time switch and Clear.
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
- **Robustness:** a crash must never leave Windows unusable. WinPad changes the taskbar only while the dock is on, and every way out (off, quit, update, crash, next start, uninstall) restores it from the saved original state.
- **Privacy:**
  - File search reads only the local Windows Search index.
  - The only network calls go to Open-Meteo, with the city name only, to GitHub releases for updates, and to the iCal links the user adds.
  - AI usage comes from Claude Code's and Codex's own log files on this PC; nothing is sent anywhere. Screen Time is opt-in and never leaves the PC.
  - The phone panel reads Phone Link's local Start-menu card, and only the phone's name, picture and status row. Contacts and calls in that card are never read into WinPad.
- **Language:** the UI is in English. App-name matching also understands Turkish app names.

## Known limitations

- Primary monitor only, for Launchpad and the dock.
- The dock has no notification area of its own: Windows keeps its tray icons, so leave the Windows taskbar on Auto-hide to reach them. The clock, Wi-Fi, sound and battery of that tray are covered by WinPad's own items.
- Notifications need permission under Privacy → Notifications, and Windows only offers it to some builds; without it the panel explains what to turn on.
- There are no live window thumbnails (a list of window titles instead), no brightness control and no Win+T switcher. Battery saver can be read but only Windows can switch it, so that pill opens Settings.
- Claude usage is a local token count (no plan percentage, since Claude Code does not log one); ChatGPT usage needs the Codex CLI. iCal time zones that are not IANA names (some Outlook feeds) fall back to local time.
- When an elevated (administrator) window has focus, the low-level keyboard hook cannot see the Win key, so Windows' Start opens instead (UIPI).
- Start and search button clicks are recognized through the taskbar's UI Automation elements `StartButton` and `SearchButton`, primary taskbar only. The search box style of the taskbar search is untested. If that lookup fails, the fallback watches Windows' own processes (`StartMenuExperienceHost.exe` / `SearchHost.exe`) and shows a brief flash of Windows' menu. A future Windows redesign may require an update.

## Success criteria

- The Win key and the Start button open WinPad 100% of the time when the setting is on, and Windows' Start menu never remains visible.
- Opening, paging and drag feedback stay smooth on a mid-range laptop, with idle CPU near 0%.
- The user can rebuild their personal layout (folders, nested folders, locks, widgets) without ever editing files.
