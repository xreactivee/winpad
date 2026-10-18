import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CloudSun, Info, LayoutGrid, Minus, Pencil, Puzzle, SlidersHorizontal, Square, Trash2, X, type LucideIcon } from "lucide-react";
import { version } from "../../package.json";
import { api, currentWindow } from "../lib/api";
import { useApps } from "../lib/apps";
import { DEFAULT_SETTINGS, useSetting, type HomeView, type IconStyle, type PhonePanelMode, type Settings as SettingsShape } from "../lib/settings";
import { useStored } from "../lib/store";
import { useWallpaper } from "../lib/wallpaper";
import { AppIcon } from "../components/AppIcon";
import { Backdrop } from "../components/Backdrop";
import { Logo } from "../components/Logo";
import { Segmented, Slider, Switch } from "../components/controls";
import { WidgetEditor } from "../widgets/WidgetEditor";
import { WidgetFrame } from "../widgets/WidgetFrame";
import { WidgetGallery } from "../widgets/WidgetGallery";
import { BASE, SIZE_LABEL, newWidget, useWidgets, widgetDef, withoutWidget, type WidgetInstance } from "../widgets/registry";

type Section = { key: "general" | "launchpad" | "widgets" | "weather" | "about"; name: string; lede: string; icon: LucideIcon };

const SECTIONS: Section[] = [
  { key: "general", name: "General", lede: "How WinPad fits into Windows.", icon: SlidersHorizontal },
  { key: "launchpad", name: "Launchpad", lede: "What opens, how it is laid out and how it looks.", icon: LayoutGrid },
  { key: "widgets", name: "Widgets", lede: "Glanceable widgets on the first page of Launchpad.", icon: Puzzle },
  { key: "weather", name: "Weather", lede: "Location and units for weather widgets.", icon: CloudSun },
  { key: "about", name: "About", lede: "", icon: Info },
];

export function Settings() {
  const [section, setSection] = useState<Section["key"]>("general");
  const current = SECTIONS.find((s) => s.key === section)!;
  const { blurred } = useWallpaper();
  return (
    <div className="settings" style={blurred ? ({ "--wallpaper": `url("${blurred}")` } as CSSProperties) : undefined}>
      <Backdrop dim={0.52} />
      <aside className="settings-sidebar glass">
        <div className="brand" data-tauri-drag-region>
          <Logo size={30} />
          <div>
            <div className="brand-name">WinPad</div>
            <div className="brand-version">Version {version}</div>
          </div>
        </div>
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button key={s.key} className="nav-item" aria-current={s.key === section ? "page" : undefined} onClick={() => setSection(s.key)}>
              <s.icon size={16} strokeWidth={1.8} />
              {s.name}
            </button>
          ))}
        </nav>
      </aside>
      <main className="settings-main">
        <header className="settings-titlebar" data-tauri-drag-region>
          <WindowControls />
        </header>
        <div key={section} className="scroll settings-content">
          {section !== "about" && (
            <div className="settings-heading">
              <h1>{current.name}</h1>
              <p>{current.lede}</p>
            </div>
          )}
          {section === "general" && <GeneralPane />}
          {section === "launchpad" && <LaunchpadPane />}
          {section === "widgets" && <WidgetsPane />}
          {section === "weather" && <WeatherPane />}
          {section === "about" && <AboutPane />}
        </div>
      </main>
    </div>
  );
}

function WindowControls() {
  return (
    <div className="caption-buttons">
      <button aria-label="Minimize" onClick={() => currentWindow?.minimize()}>
        <Minus size={16} strokeWidth={1.4} />
      </button>
      <button aria-label="Maximize" onClick={() => currentWindow?.toggleMaximize()}>
        <Square size={12} strokeWidth={1.4} />
      </button>
      <button aria-label="Close" className="close" onClick={() => currentWindow?.hide()}>
        <X size={17} strokeWidth={1.4} />
      </button>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card-group">
      {title && <h2>{title}</h2>}
      <div className="card">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {hint && <div className="setting-hint">{hint}</div>}
      </div>
      {children && <div className="setting-control">{children}</div>}
    </div>
  );
}

type BooleanKey = { [K in keyof SettingsShape]: SettingsShape[K] extends boolean ? K : never }[keyof SettingsShape];

function ToggleRow({ setting, label, hint }: { setting: BooleanKey; label: string; hint?: string }) {
  const [value, setValue] = useSetting(setting);
  return (
    <Row label={label} hint={hint}>
      <Switch value={value} onChange={setValue} label={label} />
    </Row>
  );
}

type PickerOption<T extends string> = { value: T; label: string; hint: string; art: ReactNode };

function Picker<T extends string>({ value, options, onChange }: { value: T; options: PickerOption<T>[]; onChange: (v: T) => void }) {
  return (
    <div className="picker" role="radiogroup" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className="picker-option" onClick={() => onChange(o.value)}>
          <div className="picker-art">{o.art}</div>
          <div className="picker-label">{o.label}</div>
          <div className="picker-hint">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}

const tiles = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />);

const HOME_VIEWS: PickerOption<HomeView>[] = [
  {
    value: "pages",
    label: "Pages",
    hint: "Full screen, with folders and widgets",
    art: (
      <div className="mini mini-pages">
        <span className="mini-pill" />
        <div className="mini-grid">
          <b />
          {tiles(17)}
        </div>
        <span className="mini-dots" />
      </div>
    ),
  },
  {
    value: "library",
    label: "App Library",
    hint: "Apps sorted into categories",
    art: (
      <div className="mini mini-library">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>{tiles(4)}</div>
        ))}
      </div>
    ),
  },
  {
    value: "window",
    label: "Applications window",
    hint: "A floating window over the desktop",
    art: (
      <div className="mini mini-window">
        <div>
          <span className="mini-bar" />
          <div className="mini-grid">{tiles(12)}</div>
        </div>
      </div>
    ),
  },
];

function GeneralPane() {
  const [autostart, setAutostart] = useState(false);
  useEffect(() => {
    api.autostart().then(setAutostart).catch(() => {});
  }, []);
  return (
    <>
      <Card title="Start menu">
        <ToggleRow setting="winKey" label="Replace the Start menu" hint="The Win key and the Start button open WinPad. Win+E, Win+R and other shortcuts keep working." />
        <Row label="Start with Windows" hint="Launch WinPad in the background when you sign in.">
          <Switch value={autostart} onChange={async (on) => setAutostart(await api.setAutostart(on))} label="Start with Windows" />
        </Row>
      </Card>
      <Card title="Keyboard">
        <Row label="Open or close WinPad">
          <kbd>Win</kbd>
        </Row>
        <Row label="Search apps" hint="Start typing anywhere in Launchpad.">
          <kbd>A–Z</kbd>
        </Row>
        <Row label="Change page">
          <kbd>←</kbd>
          <kbd>→</kbd>
        </Row>
        <Row label="Go back or close">
          <kbd>Esc</kbd>
        </Row>
      </Card>
    </>
  );
}

function GridPreview({ cols, rows }: { cols: number; rows: number }) {
  return (
    <div className="grid-preview">
      <div style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>{tiles(cols * rows)}</div>
    </div>
  );
}

function LaunchpadPane() {
  const [view, setView] = useSetting("homeView");
  const [phone, setPhone] = useSetting("phonePanel");
  const [cols, setCols] = useSetting("gridCols");
  const [rows, setRows] = useSetting("gridRows");
  const [iconStyle, setIconStyle] = useSetting("iconStyle");
  const [layout, setLayout] = useStored<unknown>("layout", null);
  const sample = useApps().find((a) => a.icon);
  const iconOption = (value: IconStyle, label: string, hint: string): PickerOption<IconStyle> => ({
    value,
    label,
    hint,
    art: (
      <div className="mini mini-icon">
        <AppIcon app={sample} size={52} variant={value} />
      </div>
    ),
  });
  return (
    <>
      <Card title="Opens to">
        <div className="card-pad">
          <Picker value={view} options={HOME_VIEWS} onChange={setView} />
        </div>
      </Card>
      <Card title="Grid">
        <div className="grid-editor">
          <GridPreview cols={cols} rows={rows} />
          <div className="grid-sliders">
            <label>
              <span>Columns</span>
              <Slider value={cols} min={5} max={10} onChange={setCols} />
              <output>{cols}</output>
            </label>
            <label>
              <span>Rows</span>
              <Slider value={rows} min={3} max={7} onChange={setRows} />
              <output>{rows}</output>
            </label>
            <p className="setting-hint">Applies to Pages. Widgets take 2×2, 4×2 or 4×4 cells.</p>
          </div>
        </div>
      </Card>
      <Card title="Phone">
        <Row label="Phone panel" hint="Your phone from Phone Link, beside the apps. Needs Phone Link set up.">
          <Segmented<PhonePanelMode>
            value={phone}
            options={[
              { value: "open", label: "Open" },
              { value: "collapsed", label: "Button" },
              { value: "off", label: "Off" },
            ]}
            onChange={setPhone}
          />
        </Row>
      </Card>
      <Card title="Appearance">
        <div className="card-pad">
          <Picker value={iconStyle} options={[iconOption("glass", "Glass squircle", "Every icon on the same glass tile"), iconOption("original", "Original", "Icons exactly as the apps ship them")]} onChange={setIconStyle} />
        </div>
        <ToggleRow setting="liquidRefraction" label="Liquid glass refraction" hint="Bends light along glass edges. Uses more CPU; leave it off on slower PCs." />
        <ToggleRow setting="clock24" label="24-hour time" hint="For clock widgets." />
      </Card>
      <Card>
        <Row label="Reset layout" hint="Removes folders, locks and your order. Apps go back to alphabetical order.">
          <button className="btn danger" disabled={!layout} onClick={() => setLayout(null)}>
            Reset
          </button>
        </Row>
      </Card>
    </>
  );
}

function previewSize(w: WidgetInstance) {
  const base = BASE[w.size];
  const width = Math.min(200, (110 * base.w) / base.h);
  return { width, height: (width * base.h) / base.w };
}

function WidgetsPane() {
  const [widgets, setWidgets] = useWidgets();
  const [gallery, setGallery] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const list = Object.values(widgets);
  const editing = editId ? widgets[editId] : undefined;
  const save = (w: WidgetInstance) => setWidgets((ws) => ({ ...ws, [w.id]: w }));
  return (
    <>
      <div className="pane-actions">
        <span className="setting-hint">Turning a widget off hides it without deleting it.</span>
        <button className="btn primary" onClick={() => setGallery(true)}>
          Add Widget…
        </button>
      </div>
      {list.length ? (
        <div className="widget-grid">
          {list.map((w) => {
            const def = widgetDef(w.type);
            return (
              <article key={w.id} className="widget-card" data-off={!w.enabled || undefined}>
                <div className="widget-card-preview">
                  <WidgetFrame w={w} preview {...previewSize(w)} />
                </div>
                <div className="widget-card-meta">
                  <div style={{ minWidth: 0 }}>
                    <div className="setting-label">{def?.name}</div>
                    <div className="setting-hint">
                      {def?.styles.find((s) => s.value === w.style)?.label} · {SIZE_LABEL[w.size]}
                    </div>
                  </div>
                  <Switch value={w.enabled} onChange={(enabled) => save({ ...w, enabled })} label={`Show ${def?.name}`} />
                </div>
                <div className="widget-card-actions">
                  <button className="btn small" onClick={() => setEditId(w.id)}>
                    <Pencil size={13} /> Edit
                  </button>
                  <button className="icon-button danger" aria-label={`Delete ${def?.name}`} onClick={() => setWidgets((ws) => withoutWidget(ws, w.id))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card empty-card">
          <Puzzle size={30} strokeWidth={1.4} />
          <div className="setting-label">No widgets yet</div>
          <div className="setting-hint">Add a clock, the weather, your calendar and more.</div>
        </div>
      )}
      {gallery && <WidgetGallery onClose={() => setGallery(false)} onAdd={save} />}
      {editing && <WidgetEditor w={editing} onChange={save} onClose={() => setEditId(null)} />}
    </>
  );
}

const WEATHER_PREVIEW = newWidget("weather", "m", "sky", "weather-preview");

function WeatherPane() {
  const [city, setCity] = useSetting("weatherCity");
  const [unit, setUnit] = useSetting("tempUnit");
  const [draft, setDraft] = useState(city);
  return (
    <>
      <div className="weather-preview">
        <WidgetFrame w={WEATHER_PREVIEW} preview width={344} height={164} />
      </div>
      <Card>
        <Row label="City" hint="Used by weather widgets that do not set their own city.">
          <input
            className="field"
            style={{ width: 220 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setCity(draft.trim() || DEFAULT_SETTINGS.weatherCity)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </Row>
        <Row label="Units">
          <Segmented
            value={unit}
            options={[
              { value: "c", label: "Celsius" },
              { value: "f", label: "Fahrenheit" },
            ]}
            onChange={setUnit}
          />
        </Row>
        <Row label="Data source" hint="Forecasts come from Open-Meteo. Only the city name is sent, and no account or key is needed." />
      </Card>
    </>
  );
}

function AboutPane() {
  return (
    <div className="about">
      <Logo size={92} className="about-logo" />
      <h1>WinPad</h1>
      <p className="about-version">Version {version}</p>
      <p className="about-blurb">A full-screen launcher that takes the place of the Start menu, with app pages, folders, an App Library and glass widgets.</p>
      <button className="btn" onClick={() => api.quitApp()}>
        Quit WinPad
      </button>
      <p className="about-credits">Orb animations by thinking-orbs (MIT). Weather by Open-Meteo.</p>
    </div>
  );
}
