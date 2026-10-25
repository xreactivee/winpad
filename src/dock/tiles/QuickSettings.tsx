import { useEffect, useState, type ReactNode } from "react";
import { Accessibility, Airplane, Battery, Bluetooth, Bolt, ChevronRight, Coffee, Gear, Leaf, Moon, Sun, Volume, VolumeHigh, VolumeMute, Wifi, WifiOff } from "reicon-react";
import { api, type RadioKind } from "../../lib/api";
import { usePoll } from "../../lib/hooks";
import { Slider } from "../../components/controls";
import { useDock } from "../state";
import { Tile } from "../Tile";

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
        <button className="qs-pill-arrow" aria-label={`${label} settings`} onClick={onArrow}>
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

export function QuickSettingsCard() {
  const dock = useDock();
  const radios = usePoll(api.radios, 4000);
  const info = usePoll(api.quickInfo, 4000);
  const dark = usePoll(api.darkTheme, 10_000);
  const battery = usePoll(api.battery, 30_000);
  const volume = usePoll(api.volume, 1000);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [level, setLevel] = useState<number | null>(null);
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    api.keepAwake().then(setAwake).catch(() => {});
  }, []);
  useEffect(() => setLocal({}), [radios, dark, info]);
  useEffect(() => setLevel(null), [volume]);

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
  const shown = level ?? Math.round((volume?.level ?? 0) * 100);
  const VolumeIcon = volume?.muted ? VolumeMute : shown > 50 ? VolumeHigh : Volume;

  return (
    <div className="qs">
      <div className="qs-grid">
        <Pill
          label="Wi-Fi"
          hint={radio("wifi") ? (info?.ssid ?? "Connected") : "Off"}
          on={radio("wifi")}
          arrow
          onClick={() => flip("wifi")}
          onArrow={() => open("ms-settings:network-wifi")}
        >
          {radio("wifi") ? <Wifi size={18} /> : <WifiOff size={18} />}
        </Pill>
        <Pill
          label="Bluetooth"
          hint={radio("bluetooth") ? "On" : "Not connected"}
          on={radio("bluetooth")}
          arrow
          onClick={() => flip("bluetooth")}
          onArrow={() => open("ms-settings:bluetooth")}
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
        <Pill label="Accessibility" arrow onClick={() => open("ms-settings:easeofaccess")} onArrow={() => open("ms-settings:easeofaccess")}>
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
        <Pill label="Battery saver" hint={info?.batterySaver ? "On" : "Off"} on={info?.batterySaver} arrow onClick={() => open("ms-settings:batterysaver")} onArrow={() => open("ms-settings:batterysaver")}>
          <Leaf size={18} />
        </Pill>
        <Pill label="Sound" arrow onClick={() => open("ms-settings:sound")} onArrow={() => open("ms-settings:sound")}>
          <VolumeHigh size={18} />
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
