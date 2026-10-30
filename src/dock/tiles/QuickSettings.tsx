import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Accessibility,
  Airplane,
  Battery,
  Bluetooth,
  Bolt,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Devices,
  Gear,
  Keyboard,
  Leaf,
  Magnifier,
  Moon,
  Speaker,
  Subtitles,
  Sun,
  Volume,
  VolumeHigh,
  VolumeMute,
  Wifi,
  WifiOff,
} from "reicon-react";
import { api, type Battery as BatteryInfo, type RadioKind } from "../../lib/api";
import { usePoll } from "../../lib/hooks";
import { Slider, Switch } from "../../components/controls";
import { useDock } from "../state";
import { Tile } from "../Tile";

type View = "wifi" | "bluetooth" | "battery" | "accessibility";

type PillProps = { label: string; hint?: string; on?: boolean; arrow?: boolean; onClick: () => void; onArrow?: () => void; children: ReactNode };

function Pill({ label, hint, on, arrow, onClick, onArrow, children }: PillProps) {
  return (
    <div className="qs-pill" data-on={on || undefined}>
      <button className="qs-pill-main" aria-pressed={on} onClick={onClick}>
        <span className="qs-pill-icon">{children}</span>
        <span className="qs-pill-text">
          <span className="ellipsis">{label}</span>
          {hint && <span className="qs-pill-hint ellipsis">{hint}</span>}
        </span>
      </button>
      {arrow && (
        <button className="qs-pill-arrow" aria-label={`More ${label} options`} onClick={onArrow}>
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

type PanelProps = { title: string; on?: boolean; onToggle?: () => void; more: string; uri: string; onBack: () => void; onOpen: (uri: string) => void; children: ReactNode };

function Panel({ title, on, onToggle, more, uri, onBack, onOpen, children }: PanelProps) {
  return (
    <div className="qs qs-panel">
      <div className="qs-head">
        <button className="icon-button" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={16} />
        </button>
        <span className="ellipsis" style={{ flex: 1, fontWeight: 650 }}>
          {title}
        </span>
        {onToggle && <Switch value={!!on} onChange={onToggle} label={title} />}
      </div>
      <div className="qs-list scroll">{children}</div>
      <div className="qs-footer">
        <button className="list-item row" style={{ flex: 1, gap: 8 }} onClick={() => onOpen(uri)}>
          <Gear size={16} />
          {more}
        </button>
      </div>
    </div>
  );
}

type ItemProps = { icon: ReactNode; label: string; hint?: string; active?: boolean; onClick?: () => void; children?: ReactNode };

function Item({ icon, label, hint, active, onClick, children }: ItemProps) {
  const body = (
    <>
      <span className="qs-pill-icon">{icon}</span>
      <span className="qs-pill-text" style={{ flex: 1 }}>
        <span className="ellipsis">{label}</span>
        {hint && <span className="qs-pill-hint ellipsis">{hint}</span>}
      </span>
      {children}
    </>
  );
  return onClick ? (
    <button className="qs-item list-item" data-on={active || undefined} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="qs-item" data-on={active || undefined}>
      {body}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <div className="nc-empty">{children}</div>;

type Nav = { onBack: () => void; onOpen: (uri: string) => void };

function WifiPanel({ on, onToggle, ...nav }: Nav & { on: boolean; onToggle: () => void }) {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const fetch = useCallback(() => (on ? api.wifiNetworks() : Promise.resolve([])), [on, tick]);
  const networks = usePoll(fetch, 10_000);
  const refresh = () => setTick((t) => t + 1);
  const connect = (ssid: string) => {
    setBusy(ssid);
    api
      .connectWifi(ssid)
      .then((ok) => ok || nav.onOpen("ms-availablenetworks:"))
      .catch(() => nav.onOpen("ms-availablenetworks:"))
      .finally(() => {
        setBusy(null);
        refresh();
      });
  };
  return (
    <Panel title="Wi-Fi" on={on} onToggle={onToggle} more="More Wi-Fi settings" uri="ms-settings:network-wifi" {...nav}>
      {!on ? (
        <Empty>Wi-Fi is off</Empty>
      ) : !networks ? (
        <Empty>Looking for networks…</Empty>
      ) : !networks.length ? (
        <Empty>No networks found</Empty>
      ) : (
        networks.map((n) => (
          <Item
            key={n.ssid}
            icon={<Wifi size={18} style={{ opacity: 0.36 + n.bars * 0.16 }} />}
            label={n.ssid}
            hint={busy === n.ssid ? "Connecting…" : n.connected ? (n.secure ? "Connected, secured" : "Connected") : n.secure ? "Secured" : "Open"}
            active={n.connected}
            onClick={n.connected || busy ? undefined : () => connect(n.ssid)}
          >
            {n.connected && (
              <button className="btn small" onClick={() => api.disconnectWifi().finally(refresh)}>
                Disconnect
              </button>
            )}
          </Item>
        ))
      )}
    </Panel>
  );
}

function BluetoothPanel({ on, onToggle, ...nav }: Nav & { on: boolean; onToggle: () => void }) {
  const fetch = useCallback(() => (on ? api.bluetoothDevices() : Promise.resolve([])), [on]);
  const devices = usePoll(fetch, 5000);
  return (
    <Panel title="Bluetooth" on={on} onToggle={onToggle} more="More Bluetooth settings" uri="ms-settings:bluetooth" {...nav}>
      {!on ? (
        <Empty>Bluetooth is off</Empty>
      ) : !devices ? (
        <Empty>Looking for devices…</Empty>
      ) : !devices.length ? (
        <Empty>No paired devices</Empty>
      ) : (
        devices.map((d) => <Item key={d.name} icon={<Devices size={18} />} label={d.name} hint={d.connected ? "Connected" : "Paired"} active={d.connected} />)
      )}
    </Panel>
  );
}

function BatteryPanel({ on, onToggle, battery, ...nav }: Nav & { on: boolean; onToggle: () => void; battery: BatteryInfo | null }) {
  return (
    <Panel title="Battery saver" on={on} onToggle={onToggle} more="Battery settings" uri="ms-settings:batterysaver" {...nav}>
      <Item
        icon={battery?.charging ? <Bolt size={18} weight="Filled" color="var(--green)" /> : <Battery size={18} />}
        label={battery ? `${battery.percent}%` : "No battery"}
        hint={battery ? (battery.charging ? "Charging" : "On battery") : "On power"}
      />
    </Panel>
  );
}

const ACCESSIBILITY = [
  { label: "Magnifier", hint: "Zoom in on the screen", exe: "magnify.exe", Icon: Magnifier },
  { label: "Narrator", hint: "Read the screen aloud", exe: "narrator.exe", Icon: Speaker },
  { label: "On-screen keyboard", hint: "Type with the pointer", exe: "osk.exe", Icon: Keyboard },
  { label: "Live captions", hint: "Caption any audio", exe: "livecaptions.exe", Icon: Subtitles },
];

function AccessibilityPanel(nav: Nav) {
  return (
    <Panel title="Accessibility" more="More accessibility settings" uri="ms-settings:easeofaccess" {...nav}>
      {ACCESSIBILITY.map(({ label, hint, exe, Icon }) => (
        <Item key={exe} icon={<Icon size={18} />} label={label} hint={hint} onClick={() => nav.onOpen(exe)} />
      ))}
    </Panel>
  );
}

export function QuickSettingsCard() {
  const dock = useDock();
  const radios = usePoll(api.radios, 4000);
  const info = usePoll(api.quickInfo, 4000);
  const dark = usePoll(api.darkTheme, 10_000);
  const battery = usePoll(api.battery, 30_000);
  const volume = usePoll(api.volume, 1000);
  const brightness = usePoll(api.brightness, 3000);
  const [view, setView] = useState<View | null>(null);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [level, setLevel] = useState<number | null>(null);
  const [light, setLight] = useState<number | null>(null);
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    api.keepAwake().then(setAwake).catch(() => {});
  }, []);
  useEffect(() => setLocal({}), [radios, dark, info]);
  useEffect(() => setLevel(null), [volume]);
  useEffect(() => setLight(null), [brightness]);

  const radio = (kind: RadioKind) => local[kind] ?? radios?.find((r) => r.kind === kind)?.on ?? false;
  const flip = (kind: RadioKind) => {
    const on = !radio(kind);
    setLocal((l) => ({ ...l, [kind]: on }));
    void api.setRadio(kind, on);
  };
  const open = (uri: string) => {
    void api.openPath(uri);
    dock.close();
  };
  const isDark = local.dark ?? dark ?? false;
  const airplane = local.airplane ?? info?.airplane ?? false;
  const saver = local.saver ?? info?.batterySaver ?? false;
  const flipSaver = () => {
    setLocal((l) => ({ ...l, saver: !saver }));
    void api.setBatterySaver(!saver);
  };
  const shown = level ?? Math.round((volume?.level ?? 0) * 100);
  const lit = light ?? brightness;
  const VolumeIcon = volume?.muted ? VolumeMute : shown > 50 ? VolumeHigh : Volume;
  const nav: Nav = { onBack: () => setView(null), onOpen: open };

  if (view === "wifi") return <WifiPanel on={radio("wifi")} onToggle={() => flip("wifi")} {...nav} />;
  if (view === "bluetooth") return <BluetoothPanel on={radio("bluetooth")} onToggle={() => flip("bluetooth")} {...nav} />;
  if (view === "battery") return <BatteryPanel on={saver} onToggle={flipSaver} battery={battery} {...nav} />;
  if (view === "accessibility") return <AccessibilityPanel {...nav} />;

  return (
    <div className="qs">
      <div className="qs-grid">
        <Pill
          label="Wi-Fi"
          hint={radio("wifi") ? (info?.ssid ?? "Not connected") : "Off"}
          on={radio("wifi")}
          arrow
          onClick={() => flip("wifi")}
          onArrow={() => setView("wifi")}
        >
          {radio("wifi") ? <Wifi size={18} /> : <WifiOff size={18} />}
        </Pill>
        <Pill
          label="Bluetooth"
          hint={radio("bluetooth") ? "On" : "Off"}
          on={radio("bluetooth")}
          arrow
          onClick={() => flip("bluetooth")}
          onArrow={() => setView("bluetooth")}
        >
          <Bluetooth size={18} />
        </Pill>
        <Pill
          label="Airplane mode"
          on={airplane}
          onClick={() => {
            const on = !airplane;
            setLocal((l) => ({ ...l, airplane: on, wifi: !on, bluetooth: !on }));
            void api.setAirplaneMode(on);
          }}
        >
          <Airplane size={18} />
        </Pill>
        <Pill label="Accessibility" arrow onClick={() => setView("accessibility")} onArrow={() => setView("accessibility")}>
          <Accessibility size={18} />
        </Pill>
        <Pill label={isDark ? "Dark mode" : "Light mode"} on={isDark} onClick={() => {
          setLocal((l) => ({ ...l, dark: !isDark }));
          void api.setDarkTheme(!isDark);
        }}>
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
        </Pill>
        <Pill label="Keep awake" on={awake} onClick={() => api.setKeepAwake(!awake).then(setAwake).catch(() => {})}>
          <Coffee size={18} />
        </Pill>
        <Pill label="Battery saver" hint={saver ? "On" : "Off"} on={saver} arrow onClick={flipSaver} onArrow={() => setView("battery")}>
          <Leaf size={18} />
        </Pill>
      </div>
      <div className="qs-slider">
        <button className="icon-button" aria-label={volume?.muted ? "Unmute" : "Mute"} onClick={() => api.setVolume(null, !volume?.muted)}>
          <VolumeIcon size={18} />
        </button>
        <Slider
          value={shown}
          min={0}
          max={100}
          onChange={(n) => {
            setLevel(n);
            void api.setVolume(n / 100);
          }}
          style={{ flex: 1 }}
        />
        <span style={{ width: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{shown}</span>
      </div>
      {lit !== null && (
        <div className="qs-slider">
          <span className="icon-button" aria-hidden>
            <Sun size={18} />
          </span>
          <Slider
            value={lit}
            min={0}
            max={100}
            onChange={(n) => {
              setLight(n);
              void api.setBrightness(n);
            }}
            style={{ flex: 1 }}
          />
          <span style={{ width: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lit}</span>
        </div>
      )}
      <div className="qs-footer">
        <span className="row" style={{ gap: 6 }}>
          {battery ? (
            <>
              {battery.charging ? <Bolt size={16} weight="Filled" color="var(--green)" /> : <Battery size={16} />}
              <span style={{ fontWeight: 600 }}>{battery.percent}%</span>
            </>
          ) : (
            <span style={{ color: "var(--text-3)" }}>On power</span>
          )}
        </span>
        <button className="icon-button" aria-label="All settings" onClick={() => open("ms-settings:")}>
          <Gear size={16} />
        </button>
      </div>
    </div>
  );
}

export function QuickSettingsTile() {
  const dock = useDock();
  const radios = usePoll(api.radios, 5000);
  const volume = usePoll(api.volume, 2000);
  const battery = usePoll(api.battery, 30_000);
  const size = Math.round(dock.tile * 0.36);
  const wifi = radios?.find((r) => r.kind === "wifi")?.on ?? false;
  const VolumeIcon = volume?.muted ? VolumeMute : (volume?.level ?? 0) > 0.5 ? VolumeHigh : Volume;
  const low = battery && !battery.charging && battery.percent <= 20;
  return (
    <Tile
      label="Quick settings"
      active={dock.openId === "quick"}
      style={{ gap: 7, padding: "0 10px" }}
      onClick={(anchor) => dock.toggle("quick", anchor, <QuickSettingsCard />, 360)}
      onWheel={(e) => {
        const next = Math.min(1, Math.max(0, (volume?.level ?? 0) + (e.deltaY < 0 ? 0.02 : -0.02)));
        void api.setVolume(next);
      }}
    >
      {wifi ? <Wifi size={size} /> : <WifiOff size={size} />}
      <VolumeIcon size={size} />
      {battery && (
        <span className="row" style={{ gap: 3 }}>
          {battery.charging ? <Bolt size={size} weight="Filled" /> : <Battery size={size} color={low ? "var(--red)" : undefined} />}
          <span style={{ fontSize: dock.tile * 0.24, fontWeight: 600 }}>{battery.percent}</span>
        </span>
      )}
    </Tile>
  );
}
