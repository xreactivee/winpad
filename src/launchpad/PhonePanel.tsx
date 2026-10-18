import type { CSSProperties, MouseEvent, SyntheticEvent } from "react";
import { ChevronRight, Image, MessageSquare, MoreHorizontal, Phone as PhoneIcon, Send, Smartphone, X } from "lucide-react";
import { api } from "../lib/api";
import { usePoll } from "../lib/hooks";
import { openMenu } from "../components/ContextMenu";
import { RoundButton } from "../components/controls";

export const PHONE_PANEL_W = 320;

const ACTIONS = [
  { label: "Messages", Icon: MessageSquare, uri: "ms-phone:messages" },
  { label: "Calls", Icon: PhoneIcon, uri: "ms-phone:calling" },
  { label: "Photos", Icon: Image, uri: "ms-phone:photos" },
  { label: "Send files", Icon: Send, uri: "ms-phone:filetransfer" },
];

type Props = { onOpen: (uri: string) => void; onCollapse: () => void; style?: CSSProperties };

export function PhonePanel({ onOpen, onCollapse, style }: Props) {
  const phone = usePoll(api.phoneInfo, 10_000);
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const more = (e: MouseEvent) => {
    e.stopPropagation();
    openMenu(e, [
      { label: "Phone Link Settings…", onClick: () => onOpen("ms-phone:settings") },
      { label: "Manage Devices…", onClick: () => onOpen("ms-phone:settings?target=DeviceList") },
      { separator: true },
      { label: "Hide Phone Panel", onClick: onCollapse },
    ]);
  };
  return (
    <div
      className="glass"
      onClick={stop}
      onPointerDown={stop}
      onContextMenu={stop}
      style={{ width: PHONE_PANEL_W, display: "flex", flexDirection: "column", overflow: "hidden", ["--r" as string]: "26px", animation: "pop-in .22s cubic-bezier(.2,.9,.3,1.1)", ...style }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 10px 0" }}>
        <button aria-label="Hide phone panel" onClick={onCollapse} style={{ width: 24, height: 24, borderRadius: 12, display: "grid", placeItems: "center", color: "var(--text-2)" }}>
          <X size={14} />
        </button>
      </div>

      {phone ? (
        <>
          <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "0 20px 18px" }}>
            <PhonePicture wallpaper={phone.wallpaper} frame={phone.frame} />
            <div style={{ fontSize: 17, fontWeight: 600, textAlign: "center" }}>{phone.name}</div>
            <div className="row" style={{ gap: 12, justifyContent: "center", minHeight: 22 }}>
              {phone.status.map((s, i) =>
                s.icon ? (
                  <img key={i} src={s.icon} alt={s.alt ?? ""} title={s.alt ?? undefined} width={20} height={20} draggable={false} />
                ) : (
                  <span key={i} style={{ fontSize: 13, color: "var(--text-2)", marginLeft: -6 }}>
                    {s.text}
                  </span>
                ),
              )}
            </div>
          </div>
          <div style={{ display: "grid", gap: 2, padding: "0 10px" }}>
            {ACTIONS.map(({ label, Icon, uri }) => (
              <button key={uri} className="row hover-fill" onClick={() => onOpen(uri)} style={{ gap: 14, height: 44, padding: "0 12px", borderRadius: 10, fontSize: 14 }}>
                <Icon size={19} strokeWidth={1.7} />
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "30px 24px", textAlign: "center" }}>
          <Smartphone size={56} strokeWidth={1.2} color="var(--text-2)" />
          <div style={{ fontSize: 16, fontWeight: 600 }}>Connect your phone</div>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>Link your Android phone or iPhone with Phone Link to see it here.</div>
          <button className="btn primary" style={{ marginTop: 6 }} onClick={() => onOpen("ms-phone:")}>
            Set Up Phone Link
          </button>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div className="row" style={{ justifyContent: "space-between", padding: "10px 12px", background: "rgba(0,0,0,.18)", boxShadow: "inset 0 .5px 0 rgba(255,255,255,.08)" }}>
        <button className="row hover-fill" onClick={() => onOpen("ms-phone:")} style={{ gap: 4, padding: "6px 8px", borderRadius: 8, fontSize: 12.5 }}>
          Open Phone Link <ChevronRight size={14} />
        </button>
        <button aria-label="More" className="hover-fill" onClick={more} style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center" }}>
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}

function PhonePicture({ wallpaper, frame }: { wallpaper: string | null; frame: string | null }) {
  if (!wallpaper && !frame) return <Smartphone size={64} strokeWidth={1.1} />;
  return (
    <div style={{ position: "relative", width: 56, height: 100 }}>
      {wallpaper && <img src={wallpaper} alt="" draggable={false} style={{ position: "absolute", inset: "3px 4px", width: 48, height: 94, objectFit: "cover", borderRadius: 7 }} />}
      {frame && <img src={frame} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: 56, height: 100 }} />}
    </div>
  );
}

export function PhoneToggle({ onOpen, style }: { onOpen: () => void; style?: CSSProperties }) {
  return (
    <RoundButton label="Show phone panel" onClick={onOpen} style={style}>
      <Smartphone size={16} />
    </RoundButton>
  );
}
