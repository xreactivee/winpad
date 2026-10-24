import { useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { ChevronRight, CircleUserRound, Settings } from "lucide-react";
import { api, fileSrc, type Account } from "../lib/api";
import { useOutsideClick, usePoll } from "../lib/hooks";
import { Glass } from "../components/Glass";
import { RoundButton } from "../components/controls";

type Props = { onOpen: (uri: string) => void; onSignOut: () => void; style?: CSSProperties };

const MS_COLORS = ["#f25022", "#7fba00", "#00a4ef", "#ffb900"];

function Avatar({ account, size }: { account: Account; size: number }) {
  if (!account.picture) return <CircleUserRound size={size} strokeWidth={1.4} />;
  return <img src={fileSrc(account.picture)} alt="" width={size} height={size} draggable={false} style={{ borderRadius: "50%", objectFit: "cover" }} />;
}

export function AccountButton({ onOpen, onSignOut, style }: Props) {
  const account = usePoll(api.accountInfo, 300_000);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));
  if (!account) return null;
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <RoundButton label={account.name} onClick={() => setOpen((o) => !o)}>
        <Avatar account={account} size={account.picture ? 30 : 18} />
      </RoundButton>
      {open && (
        <Glass
          solid
          frost
          radius={16}
          onClick={stop}
          onPointerDown={stop}
          onContextMenu={stop}
          style={{ position: "absolute", top: 44, right: 0, zIndex: 3, width: 340, overflow: "hidden", animation: "pop-in .12s ease-out" }}
        >
          <div className="row" style={{ justifyContent: "space-between", padding: "12px 12px 0 18px" }}>
            {account.email ? (
              <span className="row" style={{ gap: 8, fontSize: 14, fontWeight: 600, color: "var(--text-2)" }}>
                <span style={{ display: "grid", gridTemplateColumns: "7px 7px", gap: 1 }}>
                  {MS_COLORS.map((c) => (
                    <span key={c} style={{ width: 7, height: 7, background: c }} />
                  ))}
                </span>
                Microsoft
              </span>
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Local Account</span>
            )}
            <button className="hover-fill" onClick={onSignOut} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 13 }}>
              Sign Out
            </button>
          </div>
          <div className="row" style={{ gap: 16, padding: "16px 18px 18px" }}>
            <div style={{ flex: "none", width: 72, height: 72, display: "grid", placeItems: "center" }}>
              <Avatar account={account} size={72} />
            </div>
            <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <span className="ellipsis" style={{ fontSize: 17, fontWeight: 600 }}>
                {account.name}
              </span>
              {account.email && (
                <>
                  <span className="ellipsis" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    {account.email}
                  </span>
                  <button onClick={() => onOpen("https://account.microsoft.com/")} style={{ justifySelf: "start", fontSize: 12.5, color: "var(--accent-hover)" }}>
                    My Microsoft Account
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={{ padding: 6, boxShadow: "inset 0 .5px 0 var(--sep)" }}>
            <button className="row list-item" onClick={() => onOpen("ms-settings:yourinfo")} style={{ width: "100%", gap: 12, height: 40, padding: "0 12px" }}>
              <Settings size={17} strokeWidth={1.7} />
              <span style={{ flex: 1 }}>Account Settings</span>
              <ChevronRight size={15} color="var(--text-3)" />
            </button>
          </div>
        </Glass>
      )}
    </div>
  );
}
