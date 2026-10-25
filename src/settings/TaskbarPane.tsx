import { useEffect, useState } from "react";
import { Plus, X } from "reicon-react";
import { api } from "../lib/api";
import { useApps } from "../lib/apps";
import { addItem, moveItem, pinsFromTaskbar, togglePin, withoutItem, type TileType } from "../lib/dock";
import { useSetting, type DockEdge, type DockSize, type DockStyle, type DockTaskbar, type DockWidth } from "../lib/settings";
import { uid } from "../lib/util";
import { Modal } from "../components/Modal";
import { Segmented } from "../components/controls";
import { TILES, TILE_CATEGORIES, tileDef } from "../dock/registry";
import { loadCalendar, useDockLayout } from "../dock/state";
import { Card, DragList, Picker, Row, ToggleRow, type PickerOption } from "./parts";

const ACCENTS = ["#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff453a", "#ff9f0a", "#ffd60a", "#30d158", "#64d2ff"];

const dockArt = (edge: DockEdge, width: DockWidth, style: DockStyle) => (
  <div className="mini">
    <span className="mini-dock" data-edge={edge} data-width={width} data-style={style}>
      <i />
      <i />
      <i />
      <i />
    </span>
  </div>
);

const STYLES: [DockStyle, string, string][] = [
  ["glass", "Glass", "Frosted wallpaper"],
  ["liquid", "Liquid Glass", "Clear glass that bends the edges"],
  ["tinted", "iOS Glass", "Glass under a deeper tint"],
  ["midnight", "Midnight", "A deep, quiet blue"],
  ["black", "Black", "Solid and dark"],
  ["white", "White", "Solid and light"],
  ["clear", "Clear", "Only the items"],
];

function ItemGallery({ present, onAdd, onClose }: { present: TileType[]; onAdd: (t: TileType) => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose} width={620} title="Add to Dock">
      <div className="scroll" style={{ display: "grid", gap: 16, maxHeight: "62vh" }}>
        {TILE_CATEGORIES.map((cat) => (
          <section key={cat} style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>{cat}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {TILES.filter((t) => t.category === cat).map((t) => (
                <button
                  key={t.type}
                  className="list-item"
                  disabled={present.includes(t.type)}
                  style={{ opacity: present.includes(t.type) ? 0.45 : 1 }}
                  onClick={() => {
                    onAdd(t.type);
                    onClose();
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{t.description}</div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function ItemsCard() {
  const [layout, setLayout] = useDockLayout();
  const [gallery, setGallery] = useState(false);
  const apps = useApps();
  const byId = new Map(apps.map((a) => [a.id, a]));
  const pins = layout.pins.filter((id) => byId.has(id));
  const reorderPins = (id: string, to: number) =>
    setLayout((l) => {
      const known = pins.filter((p) => p !== id);
      known.splice(to, 0, id);
      return { ...l, pins: [...known, ...l.pins.filter((p) => !byId.has(p))] };
    });
  return (
    <>
      <Card title="Items">
        <DragList ids={layout.items.map((i) => i.id)} onMove={(id, to) => setLayout((l) => moveItem(l, id, to))}>
          {(id) => {
            const item = layout.items.find((i) => i.id === id);
            const def = item && tileDef(item.type);
            return (
              <Row label={def?.name ?? "Item"} hint={def?.description}>
                <button className="icon-button danger" aria-label={`Remove ${def?.name ?? "item"}`} onClick={() => setLayout((l) => withoutItem(l, id))}>
                  <X size={15} />
                </button>
              </Row>
            );
          }}
        </DragList>
        <Row label="Add an item" hint="Tray, quick settings, notifications, clocks, calendar, system meters, files, focus timers, Screen Time and AI limits. Drag a row to move it; right-click the dock for the same menu.">
          <button className="btn primary" onClick={() => setGallery(true)}>
            <Plus size={14} /> Add Item…
          </button>
        </Row>
      </Card>
      <Card title="Pinned apps">
        <DragList ids={pins} onMove={reorderPins}>
          {(id) => {
            const app = byId.get(id)!;
            return (
              <Row label={app.name}>
                <button className="icon-button danger" aria-label={`Unpin ${app.name}`} onClick={() => setLayout((l) => togglePin(l, id))}>
                  <X size={15} />
                </button>
              </Row>
            );
          }}
        </DragList>
        <Row label={pins.length ? "Pin more apps" : "No pinned apps"} hint="In Launchpad, right-click an app and choose Pin to Dock. Open apps always appear on the dock.">
          <button
            className="btn"
            onClick={() =>
              api
                .taskbarPins()
                .then((names) => setLayout((l) => ({ ...l, pins: [...new Set([...l.pins, ...pinsFromTaskbar(names, apps)])], seeded: true })))
            }
          >
            Import Taskbar Pins
          </button>
        </Row>
      </Card>
      {gallery && <ItemGallery present={layout.items.map((i) => i.type)} onAdd={(t) => setLayout((l) => addItem(l, t, uid("d")))} onClose={() => setGallery(false)} />}
    </>
  );
}

function CalendarsCard() {
  const [calendars, setCalendars] = useSetting("calendars");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Record<string, string>>({});
  const check = (url: string) => {
    setStatus((s) => ({ ...s, [url]: "Checking…" }));
    loadCalendar(url, true)
      .then((events) => setStatus((s) => ({ ...s, [url]: `${events.length} events` })))
      .catch((e) => setStatus((s) => ({ ...s, [url]: typeof e === "string" ? e : "Could not read this calendar" })));
  };
  useEffect(() => calendars.forEach(check), []);
  const add = () => {
    const url = draft.trim();
    if (!url || calendars.includes(url)) return;
    setCalendars([...calendars, url]);
    setDraft("");
    check(url);
  };
  return (
    <Card title="Calendars">
      {calendars.map((url) => (
        <Row key={url} label={url.replace(/^(webcal|https):\/\//, "").split("/")[0]} hint={status[url]}>
          <button className="icon-button danger" aria-label="Remove calendar" onClick={() => setCalendars(calendars.filter((c) => c !== url))}>
            <X size={15} />
          </button>
        </Row>
      ))}
      <Row
        label="Add a calendar"
        hint="Paste a secret iCal link: Google Calendar's “Secret address in iCal format”, a published Outlook calendar (ICS) or an iCloud public calendar. It is read every 15 minutes, read-only, and the link stays on this PC."
      >
        <div className="row" style={{ gap: 6 }}>
          <input className="field" style={{ width: 230 }} placeholder="https:// or webcal://" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn" disabled={!draft.trim()} onClick={add}>
            Add
          </button>
        </div>
      </Row>
    </Card>
  );
}

function AutomationsCard() {
  const [quiet] = useSetting("quietHours");
  const [from, setFrom] = useSetting("quietFrom");
  const [to, setTo] = useSetting("quietTo");
  return (
    <Card title="Automations">
      <ToggleRow setting="autoMeeting" label="Meeting mode" hint="Five minutes before an event, a reminder appears and the music pauses." />
      <ToggleRow setting="autoAiLimit" label="AI limit alerts" hint="A warning when a ChatGPT (Codex) limit passes 90%." />
      <ToggleRow setting="autoHealth" label="Health alerts" hint="Low battery and almost full storage." />
      <ToggleRow setting="autoFocusMusic" label="Focus music" hint="Starting a Pomodoro focus round starts your music." />
      <ToggleRow setting="autoSunset" label="Sunset dark mode" hint="Windows turns dark at sunset and light at sunrise, for your weather city." />
      <ToggleRow setting="quietHours" label="Quiet hours" hint="Reminders and alerts stay silent; music and the theme still follow the rules." />
      {quiet && (
        <Row label="Quiet from">
          <div className="row" style={{ gap: 6 }}>
            <input type="time" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span style={{ color: "var(--text-3)" }}>to</span>
            <input type="time" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </Row>
      )}
    </Card>
  );
}

export function TaskbarPane() {
  const [dock] = useSetting("dock");
  const [taskbar, setTaskbar] = useSetting("dockTaskbar");
  const [edge, setEdge] = useSetting("dockEdge");
  const [width, setWidth] = useSetting("dockWidth");
  const [size, setSize] = useSetting("dockSize");
  const [style, setStyle] = useSetting("dockStyle");
  const [accent, setAccent] = useSetting("dockAccent");
  const edges: PickerOption<DockEdge>[] = [
    { value: "bottom", label: "Bottom", hint: "Where the taskbar lives", art: dockArt("bottom", width, style) },
    { value: "top", label: "Top", hint: "A menu bar, with panels opening down", art: dockArt("top", width, style) },
  ];
  const styles: PickerOption<DockStyle>[] = STYLES.map(([value, label, hint]) => ({ value, label, hint, art: dockArt(edge, width, value) }));
  return (
    <>
      <Card title="Taskbar">
        <ToggleRow setting="dock" label="Use the WinPad dock" hint="A dock with your apps and live widgets on the screen edge. Turn it off and the Windows taskbar is back exactly as it was." />
        {dock && (
          <Row label="Windows taskbar" hint="Auto-hide keeps it, with the notification area, one nudge away at the screen edge. Hidden removes it. It is restored when the dock is off or WinPad quits.">
            <Segmented<DockTaskbar>
              value={taskbar}
              options={[
                { value: "autoHide", label: "Auto-hide" },
                { value: "hidden", label: "Hidden" },
                { value: "visible", label: "Visible" },
              ]}
              onChange={setTaskbar}
            />
          </Row>
        )}
        {dock && (
          <ToggleRow
            setting="suppressToasts"
            label="Hide Windows notification banners"
            hint="Toasts stop popping up in the corner; they still arrive, and the Notifications item on the dock shows them. Switched back when the dock is off or WinPad quits."
          />
        )}
      </Card>
      <Card title="Dock">
        <div className="card-pad">
          <Picker value={edge} options={edges} onChange={setEdge} />
        </div>
        <Row label="Width" hint="Floating sits in the middle; full width spans the screen edge like the taskbar.">
          <Segmented<DockWidth>
            value={width}
            options={[
              { value: "pill", label: "Floating" },
              { value: "full", label: "Full width" },
            ]}
            onChange={setWidth}
          />
        </Row>
        <Row label="Size">
          <Segmented<DockSize>
            value={size}
            options={[
              { value: "s", label: "S" },
              { value: "m", label: "M" },
              { value: "l", label: "L" },
            ]}
            onChange={setSize}
          />
        </Row>
        <ToggleRow setting="dockAutoHide" label="Hide the dock" hint="It slides away while you work and comes back when the pointer touches the screen edge." />
        <ToggleRow setting="dockLocked" label="Lock the dock" hint="Items stay put. Unlock to drag them along the dock." />
        <ToggleRow setting="dockLabels" label="Names on hover" hint="Shows an app's name above its icon." />
      </Card>
      <Card title="Appearance">
        <div className="card-pad">
          <Picker value={style} options={styles} onChange={setStyle} columns={4} />
        </div>
        <Row label="Accent color" hint="For rings, toggles and the active app.">
          <div className="row" style={{ gap: 6 }}>
            {ACCENTS.map((c) => (
              <button key={c} className="swatch" aria-label={c} aria-pressed={accent === c} style={{ background: c }} onClick={() => setAccent(c)} />
            ))}
          </div>
        </Row>
        <ToggleRow setting="clock24" label="24-hour time" hint="For the clock and calendar on the dock." />
      </Card>
      <ItemsCard />
      <CalendarsCard />
      <AutomationsCard />
      <Card title="Screen Time">
        <ToggleRow setting="screenTime" label="Count screen time" hint="Notes which app is in front every five seconds, skipping idle time. Kept on this PC for a week." />
        <Row label="Clear history">
          <button className="btn danger" onClick={() => api.clearScreenTime()}>
            Clear
          </button>
        </Row>
      </Card>
    </>
  );
}
