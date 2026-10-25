import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Bluetooth, Bolt, Coffee, HardDrive, Keyboard, Moon, Sun, Volume, VolumeHigh, VolumeMute, Wifi, WifiOff } from "reicon-react";
import { api, type RadioKind } from "../../lib/api";
import { usePoll } from "../../lib/hooks";
import { formatBytes } from "../../lib/util";
import { Slider } from "../../components/controls";
import { useDock } from "../state";
import { Card, MiniRing, Stat, Tile } from "../Tile";

export function BatteryTile() {
  const b = usePoll(api.battery, 30_000);
  const { tile } = useDock();
  const low = b && !b.charging && b.percent <= 20;
  return (
    <Tile label="Battery" style={{ gap: 6, padding: "0 10px" }}>
      {b ? (
        <>
          <MiniRing value={b.percent / 100} color={low ? "var(--red)" : "var(--green)"}>
            {b.charging ? <Bolt size={tile * 0.28} weight="Filled" /> : <span style={{ fontSize: tile * 0.22, fontWeight: 650 }}>{b.percent}</span>}
          </MiniRing>
          {b.charging && <span style={{ fontSize: tile * 0.26, fontWeight: 600 }}>{b.percent}%</span>}
        </>
      ) : (
        <Bolt size={tile * 0.4} />
      )}
    </Tile>
  );
}

export function SystemTile() {
  const s = usePoll(api.sysStats, 2000);
  const { tile } = useDock();
  const small = { fontSize: tile * 0.2, fontWeight: 650 };
  return (
    <Tile label="CPU and memory" style={{ gap: 6, padding: "0 8px" }}>
      <MiniRing value={(s?.cpu ?? 0) / 100} color="var(--accent)">
        <span style={small}>{Math.round(s?.cpu ?? 0)}</span>
      </MiniRing>
      <MiniRing value={s ? s.memUsed / s.memTotal : 0} color="#bf5af2">
        <span style={small}>{s ? Math.round((s.memUsed / s.memTotal) * 100) : 0}</span>
      </MiniRing>
    </Tile>
  );
}

export function NetworkTile() {
  const s = usePoll(api.sysStats, 2000);
  const { tile } = useDock();
  const line = { fontSize: tile * 0.24, fontWeight: 600, fontVariantNumeric: "tabular-nums" as const, gap: 4 };
  return (
    <Tile label="Network" style={{ flexDirection: "column", alignItems: "flex-start", gap: 0, padding: "0 12px", minWidth: tile * 2.3 }}>
      <span className="row" style={line}>
        <ArrowDown size={tile * 0.26} color="var(--green)" /> {formatBytes(s?.netRx ?? 0)}/s
      </span>
      <span className="row" style={line}>
        <ArrowUp size={tile * 0.26} color="var(--accent)" /> {formatBytes(s?.netTx ?? 0)}/s
      </span>
    </Tile>
  );
}

export function StorageTile() {
  const s = usePoll(api.sysStats, 60_000);
  const { tile } = useDock();
  const used = s ? s.diskUsed / Math.max(1, s.diskTotal) : 0;
  return (
    <Tile label="Storage" style={{ gap: 8, padding: "0 12px" }}>
      <HardDrive size={tile * 0.4} />
      <span style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: tile * 0.25, fontWeight: 600 }}>{s ? `${formatBytes(s.diskTotal - s.diskUsed)} free` : "…"}</span>
        <span className="dock-meter">
          <i style={{ width: `${used * 100}%`, background: used > 0.9 ? "var(--red)" : "var(--accent)" }} />
        </span>
      </span>
    </Tile>
  );
}

function Toggle({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="dock-toggle" aria-label={label} aria-pressed={on} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function TogglesTile() {
  const { tile } = useDock();
  const radios = usePoll(api.radios, 5000);
  const dark = usePoll(api.darkTheme, 10_000);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    api.keepAwake().then(setAwake).catch(() => {});
  }, []);
  useEffect(() => setLocal({}), [radios, dark]);
  const radio = (kind: RadioKind) => local[kind] ?? radios?.find((r) => r.kind === kind)?.on;
  const isDark = local.dark ?? dark ?? false;
  const icon = tile * 0.36;
  const flip = (kind: RadioKind) => {
    const on = !radio(kind);
    setLocal((l) => ({ ...l, [kind]: on }));
    void api.setRadio(kind, on);
  };
  return (
    <div className="dock-tile" style={{ gap: 4, padding: "0 6px", cursor: "default" }}>
      {radio("wifi") !== undefined && (
        <Toggle label="Wi-Fi" on={!!radio("wifi")} onClick={() => flip("wifi")}>
          {radio("wifi") ? <Wifi size={icon} /> : <WifiOff size={icon} />}
        </Toggle>
      )}
      {radio("bluetooth") !== undefined && (
        <Toggle label="Bluetooth" on={!!radio("bluetooth")} onClick={() => flip("bluetooth")}>
          <Bluetooth size={icon} />
        </Toggle>
      )}
      <Toggle
        label="Dark mode"
        on={isDark}
        onClick={() => {
          setLocal((l) => ({ ...l, dark: !isDark }));
          void api.setDarkTheme(!isDark);
        }}
      >
        {isDark ? <Moon size={icon} /> : <Sun size={icon} />}
      </Toggle>
      <Toggle label="Keep awake" on={awake} onClick={() => api.setKeepAwake(!awake).then(setAwake)}>
        <Coffee size={icon} />
      </Toggle>
    </div>
  );
}

function VolumeCard() {
  const v = usePoll(api.volume, 1000);
  const [level, setLevel] = useState<number | null>(null);
  const shown = level ?? Math.round((v?.level ?? 0) * 100);
  return (
    <Card title="Sound">
      {v ? (
        <div className="row" style={{ gap: 12 }}>
          <button className="icon-button" aria-label={v.muted ? "Unmute" : "Mute"} onClick={() => api.setVolume(null, !v.muted)}>
            {v.muted ? <VolumeMute size={18} /> : <VolumeHigh size={18} />}
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
          <span style={{ width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{shown}</span>
        </div>
      ) : (
        <div style={{ color: "var(--text-3)" }}>No output device</div>
      )}
    </Card>
  );
}

export function VolumeTile() {
  const dock = useDock();
  const v = usePoll(api.volume, 2000);
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => setLevel(null), [v]);
  const shown = level ?? v?.level ?? 0;
  const Icon = v?.muted ? VolumeMute : shown > 0.5 ? VolumeHigh : Volume;
  return (
    <Tile
      label="Volume"
      style={{ gap: 6, padding: "0 12px" }}
      onClick={(anchor) => dock.toggle("volume", anchor, <VolumeCard />, 300)}
      onWheel={(e) => {
        const next = Math.min(1, Math.max(0, shown + (e.deltaY < 0 ? 0.02 : -0.02)));
        setLevel(next);
        void api.setVolume(next);
      }}
    >
      <Icon size={dock.tile * 0.4} />
      <span style={{ fontSize: dock.tile * 0.26, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{Math.round(shown * 100)}</span>
    </Tile>
  );
}

function LanguageCard() {
  const dock = useDock();
  const layouts = usePoll(api.keyboardLayouts, 1500);
  return (
    <Card title="Keyboard">
      <div style={{ display: "grid", gap: 2 }}>
        {layouts?.list.map((l) => (
          <button
            key={l.id}
            className="list-item row"
            aria-pressed={l.id === layouts.current}
            onClick={() => {
              void api.setKeyboardLayout(l.id);
              dock.close();
            }}
          >
            <b style={{ width: 28 }}>{l.code}</b>
            <span className="ellipsis">{l.name}</span>
          </button>
        ))}
      </div>
      <Stat label="Switch" value="Win + Space" />
    </Card>
  );
}

export function LanguageTile() {
  const dock = useDock();
  const layouts = usePoll(api.keyboardLayouts, 1500);
  const code = layouts?.list.find((l) => l.id === layouts.current)?.code;
  return (
    <Tile label="Keyboard language" style={{ gap: 6, padding: "0 10px" }} onClick={(anchor) => dock.toggle("language", anchor, <LanguageCard />, 280)}>
      {code ? <span style={{ fontSize: dock.tile * 0.3, fontWeight: 700 }}>{code}</span> : <Keyboard size={dock.tile * 0.4} />}
    </Tile>
  );
}
