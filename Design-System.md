# WinPad — Design System

WinPad borrows macOS Tahoe's Launchpad look: dark and translucent, built from "liquid glass" panels over a blurred wallpaper. The Settings window uses the same language. The interface is always dark (`color-scheme: dark`). Tokens live in `src/styles/base.css`, controls in `src/styles/controls.css`, glass in `src/styles/glass.css` and the Settings window in `src/styles/settings.css`. Components use inline styles for layout and shared classes for anything that repeats; both read the tokens through `var(--…)`.

## Logo

`public/logo.svg` is the single source for every place the mark appears: the in-app `Logo` component (Settings sidebar, About, the Applications window), the taskbar and window icon, and the installer.

- **Tile:** a 232px-radius squircle on a 1024 canvas, near-black (`#1b1b1f` → `#030304` radial) with a faint light rim along the top.
- **Mark:** two stacked rounded diamonds, the pages of a launcher. The back one lies flat (white → `#8d8d94`) with a soft glow. The front one is a graphite glass card (`#c6c6cd` → `#68686f` → `#222226`) whose right side fades into the tile, with a light top rim and a deep shadow on the page below. Grayscale only.
- **Proportions:** the front card spans 570px; the back card is wider (640px), so its sides show around the front one. Both cards round their corners by about 40% of an edge.
- **Icons:** regenerate them after any change with `npx tauri icon public/logo.svg`, then delete what Windows does not use (`android/`, `ios/`, `icon.icns`, `Square*Logo.png`, `StoreLogo.png`). Cargo does not notice a changed `icon.ico`, so run `cargo clean -p winpad --release` in `src-tauri/` before the next `npm run tauri build`, or the exe keeps the old icon.

## Color

| Token | Value | Use |
|---|---|---|
| `--text` | `#fff` | Primary text, icon labels |
| `--text-2` | `rgba(255,255,255,.72)` | Secondary text, captions |
| `--text-3` | `rgba(255,255,255,.5)` | Hints, tertiary info |
| `--accent` / `--accent-hover` | `#0a84ff` / `#2a95ff` | Primary buttons, focus ring, menu hover, selected picker, active nav pill |
| `--red` | `#ff453a` | Calendar weekday, low battery |
| `--danger` | `#ff6961` | Destructive menu items and buttons |
| `--green` | `#30d158` | Switch on, stopwatch, battery |
| `--orange` | `#ff9f0a` | Timer, reminders, analog second hand, the "updates ready" badge |
| `--sep` | `rgba(255,255,255,.12)` | Menu separators, dividers |
| `--hairline` | `rgba(255,255,255,.07)` | Lines between settings rows, picker borders |
| `--fill` / `--fill-strong` | white 10% / 16% | Buttons, chips, hover fills |
| `--inset` | `rgba(0,0,0,.25)` | Fields, segmented controls, search wells |

Other values in use:

- **Settings window:** the blurred wallpaper under a `rgba(0,0,0,.52)` dim; a floating glass sidebar (radius 16); cards are a white 8.5% → 5% gradient with a hairline rim, radius 14. The page behind everything is `#18181b`.
- **Launchpad backdrop:** the user's wallpaper, pre-blurred, under a `rgba(0,0,0,.34)` dim.
- **Fallback when there is no wallpaper:** the dark radial gradient in `.wallpaper-fallback`.
- **Widget tints:** Glass, Yellow `#ffd60a`, Orange `#ff9f0a`, Pink `#ff375f`, Purple `#bf5af2`, Blue `#0a84ff`, Green `#30d158`. Defined as `TINTS` in `src/widgets/shared.ts`.

## Typography

- **Family:** Inter Variable (bundled via `@fontsource-variable/inter`), falling back to Segoe UI Variable and system-ui. SF Pro is not used because of its license. Font features `cv11` and `ss01` are on, with antialiased smoothing.
- **Base size:** 13px.

| Role | Size and weight |
|---|---|
| Icon labels | 12px / 500, single line with ellipsis, `text-shadow: 0 1px 3px rgba(0,0,0,.55)` |
| Folder panel title | 30px / 600, editable inline |
| Category title (App Library) | 26px / 600 with a chevron |
| Settings page title | 28px / 680, -0.5px tracking, with a 13.5px lede in `--text-2`; card captions 12px / 600 in `--text-3`; row labels 13.5px / 500, hints 12px in `--text-3` |
| Widget headline numbers | 46–120px, 250–650 weight, `tabular-nums` for anything that ticks |

## Spacing and layout

The Launchpad grid is computed in `metrics()` in `src/launchpad/Grid.tsx`:

- **Side padding:** `max(48px, 8.5% of width)`. Top inset 92px, which leaves room for the search pill; bottom inset 64px, for the page dots.
- **Cell size:** the remaining area divided by the columns and rows.
- **Icon size:** `round(clamp(44, min(cellW × 0.5, cellH × 0.6), 104))`.
- **Widgets:** a widget spans whole cells and is inset so its edges line up with the icons.

| Widget size | Cells | Unscaled box |
|---|---|---|
| Small | 2×2 | 164×164 px |
| Medium | 4×2 | 344×164 px |
| Large | 4×4 | 344×344 px |

Widgets are designed at the unscaled box size and scaled uniformly to their slot (`BASE` in `src/widgets/shared.ts`).

Other spacing rules:

- **Folder panel:** cells are `icon × 1.55`; 3 columns for up to 9 items, 4 columns beyond that; 4 rows per page; 26px padding.
- **App Library cards:** `min(cellW × 1.55, …, 240px)` square, 4 per row.
- **Search pill:** 260×32 px, radius 12, centered 34px from the top.
- **Settings:** content column max 760px with 34px side padding; rows min-height 58px with 12px/18px padding; 24px between cards; sidebar 232px wide, nav items 36px tall.
- **Corner buttons:** 34px glass circles, 33px from the top and 30px from the right, 10px apart: phone (when collapsed), account, then power.

## Shape

| Element | Radius |
|---|---|
| App icon / folder icon (squircle) | `size × 0.225` |
| Glass default | 22px (`--r`) |
| Small widget / larger widgets | 24px / 26px |
| Folder panel | 38px |
| App Library card | `size × 0.2` |
| Context menu | 12px, items 6px |
| Settings cards / picker options / sidebar | 14px / 12px / 16px |
| Buttons, fields, segmented controls | 8px |

## Elevation and glass

`.glass` (`src/components/Glass.tsx` + `glass.css`) is the single surface primitive:

- **Default:** a translucent white gradient (17% → 5% → 11%), a rim of inset highlights, and a soft drop shadow `0 12px 32px rgba(0,0,0,.3)`. A `::before` adds a top-left specular glow.
  - It deliberately has no `backdrop-filter`: inside Launchpad the backdrop is already blurred, so the look costs nothing.
- **`frost`:** adds `backdrop-filter: blur(20px) saturate(170%)`. Only for small overlays: context menus and modals.
- **`solid`:** a near-opaque dark gradient for surfaces that must stay readable (menus, dialogs).
- **`liquid`:** an SVG displacement filter on the edges ("refraction"). Opt-in through Settings, applied only when `body.refraction` is set. It is expensive.

App icons in the "glass squircle" style draw the system icon at 74% inside a glass tile. The "original" style shows the raw icon.

### Performance rules for visuals

These are hard rules; the old shell was unusably laggy without them.

- Never put `filter` or `backdrop-filter` over content that animates (clocks, the orb, wiggling icons). The browser re-renders the filter every frame.
- Blur the wallpaper once. `useWallpaper()` makes a 160px pre-blurred copy and the browser upscales it.
- Dim a background with `opacity`, never with a blur. An open folder dims the grid to 25%.
- Animate only `transform` and `opacity`.
- Canvas animations cap their frame rate and pause when `document.hidden` is true. The orb draws at 30 fps with its dots batched into 8 alpha buckets.

## Motion

| Motion | Spec |
|---|---|
| Launchpad open | Content `scale(1.1 → 1)` over .3s `cubic-bezier(.2,.8,.2,1)`; backdrop `scale(1.06 → 1)` over .35s; opacity .22s |
| Launchpad close | Reverse, then the window hides after 230ms |
| Page change | `translateX` over .45s `cubic-bezier(.25,.8,.25,1)` |
| Reflow during drag | `left`/`top` over .3s, same curve |
| Edit mode wiggle | ±1.6° over .25s (icons) or .28s (widgets), staggered |
| Panels and menus | `pop-in` (scale .94 → 1 plus fade) over .25s / .12s; backdrops `fade-in` over .2s |
| Flip clock card | Top half folds over .3s `ease-in`, bottom half over .3s `ease-out`, 0.3s delay |
| Merge target | `scale(1.15)` plus a 3px white ring |
| Orb drag | 3D tilt (`perspective(500px) rotateX/rotateY`, clamped ±55°) with momentum, springing back at ×0.9 per frame; the particle sphere rotates its own geometry instead |
| Applications window | `pop-in` over .22s; tiles fade in staggered by 12ms |

`prefers-reduced-motion` turns all animations and transitions effectively off.

## Interaction rules

| Gesture | Rule |
|---|---|
| Tap (launches) | Under 450ms and under 8px of travel. Anything else is not a click: no launch, no close. |
| Long press on the grid | 550ms enters edit mode |
| Hold in a folder panel | 380ms picks the item up; moving sooner swipes the page |
| Drag start | 6px of travel |
| Page swipe | 80px on the grid, 50px in a folder panel |
| Wheel paging | 60 (grid) or 50 (panel) delta units, then a 450ms / 400ms lockout |
| Edge flip while dragging | Hold within 36px of the screen edge for 650ms (grid), or within 40px of the panel side for 600ms |
| Merge | Drop within `icon × 0.4–0.42` of an icon's center |
| Drag out of a folder | 24px past the panel edge |

Other rules:

- **Locked items:** they show a lock badge in edit mode, do not wiggle and cannot be dragged. Unlock them first.
- **Esc order:** subfolder, folder, category, search, edit mode, then close.

## Components

| Component | File | Notes |
|---|---|---|
| `Glass` | `components/Glass.tsx` | Variants `liquid`, `solid`, `frost`; `radius` prop; forwards `ref` |
| `AppIcon` | `components/AppIcon.tsx` | Squircle frame (`.icon-glass`); letter fallback when there is no icon; `variant` overrides the setting for previews |
| `AppTile` | `components/AppTile.tsx` | Icon plus label button used by search results, categories and the Applications window |
| `Backdrop` | `components/Backdrop.tsx` | Pre-blurred wallpaper plus a dim; Launchpad and Settings |
| `Logo` | `components/Logo.tsx` | `public/logo.svg`; hides itself when the file is missing |
| `ContextMenu` / `openMenu()` | `components/ContextMenu.tsx` | One host per window; optional Reicon icon per item; can align its right edge to an anchor; kept inside the viewport; Esc or outside click closes |
| `Modal` | `components/Modal.tsx` | `solid frost` glass, used for the gallery, widget editor and category picker |
| `SearchBar` | `launchpad/SearchBar.tsx` | Glass pill with a clear button; sits above the page strip (`zIndex: 2`) |
| `Grid` | `launchpad/Grid.tsx` | One page; positions items from `packPage()`; lock badges |
| `FolderIcon` / `FolderPanel` | `launchpad/Folder.tsx` | 3×3 preview (subfolders as tiny folders); paged panel with hold-to-drag |
| `AppLibrary` / `CategoryView` | `launchpad/AppLibrary.tsx` | Category cards; the in-place category grid |
| `PhonePanel` / `PhoneToggle` | `launchpad/PhonePanel.tsx` | 320px glass side panel, radius 26: close button, phone picture (Phone Link thumbnail in its frame, 56×100), name 17px/600, status row (Phone Link's own 20px icons plus text), 44px shortcut rows with 19px Reicon icons, and a footer bar (`rgba(0,0,0,.18)`) with "Open Phone Link ›" and "…". Gets `frosted` in the window view. The toggle is a 34px glass circle at the top right |
| `AppWindow` | `launchpad/AppWindow.tsx` | Floating Applications panel: min(860, 92vw) × min(620, 84vh), radius 26; title, search, category chips, recent row, divider, 98×96 tiles with 56px icons. Frosted via the fixed pre-blurred wallpaper; no backdrop dim |
| `AccountButton` | `launchpad/AccountButton.tsx` | 34px glass circle with the 30px account picture (Reicon user icon without one); opens a 340px `solid frost` panel, radius 16, right-aligned 44px below: header ("Microsoft" with the four-square mark, Sign Out), 72px picture with name 17px/600, email 12.5px in `--text-2` and an `--accent-hover` link, then an Account Settings row |
| `FileResults` | `launchpad/FileResults.tsx` | "Files and Folders" caption (12px/600, `--text-3`) and 48px `.list-item` rows: 28px shell icon, name 14px/500, containing folder 12px in `--text-3`; the selected row uses `aria-pressed`. On a 720px glass card (radius 18) under the app results in Pages and App Library; bare inside the Applications window |
| `PowerButton` | `launchpad/PowerButton.tsx` | 34px glass circle with an orange dot when updates are ready; opens the power menu right-aligned under it: Lock, Sign Out, Sleep, (Update and Shut Down), Shut Down, (Update and Restart), Restart |
| `Dots` | `components/Dots.tsx` | 8px page dots, white when active |
| `WidgetFrame` | `widgets/WidgetFrame.tsx` | Scales a widget to its slot; glass or bare (orb, flip clock, photo fill); remove button in edit mode |
| Controls | `components/controls.tsx` + `styles/controls.css` | `Switch`, `Segmented`, `Select`, `Slider`, `RoundButton`; classes `.btn` (`.primary`, `.danger`, `.small`), `.icon-button`, `.field`, `.chip`, `.list-item`, `.well`, `.swatch`, `.app-tile`, `.app-label`, `.ellipsis`, `.row`, `.scroll`, `kbd` |
| Settings | `settings/Settings.tsx` + `styles/settings.css` | Sidebar with brand and nav (active item: 13% fill plus a 3px accent pill); Windows-style caption buttons (46×36, close turns `#c42b1c`); cards of rows; visual `Picker` options with miniature screens drawn over the user's wallpaper (`--wallpaper`); live grid preview; widget cards with live previews |

## Writing

- All UI text is English, in sentence case except proper titles: "Add Widget", "Lock Position", "Show in Explorer".
- Menu items that open a dialog end with an ellipsis "…".
- Destructive menu items use the `danger` style.
- Keep labels short. Put the explanation in a setting's `hint`, not in its label.
