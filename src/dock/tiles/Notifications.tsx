import { Bell, BellOff, Minus, Play, Plus, X } from "reicon-react";
import { useEffect, useState } from "react";
import { api, fileSrc, type Notif } from "../../lib/api";
import { usePoll } from "../../lib/hooks";
import { useSetting } from "../../lib/settings";
import { shortDuration } from "../../lib/time";
import { useDock } from "../state";
import { startFocus } from "./Focus";
import { Tile } from "../Tile";

const LEAVE_MS = 180;

function groups(items: Notif[]) {
  const out: { app: string; items: Notif[] }[] = [];
  for (const item of items) {
    const last = out.at(-1);
    if (last && last.app === item.app) last.items.push(item);
    else out.push({ app: item.app || "Notifications", items: [item] });
  }
  return out;
}

export function NotificationsCard() {
  const dock = useDock();
  const feed = usePoll(api.notifications, 4000);
  const [quiet, setQuiet] = useSetting("quietHours");
  const [minutes, setMinutes] = useState(30);
  const [leaving, setLeaving] = useState<number[]>([]);
  const [gone, setGone] = useState<number[]>([]);
  const all = feed?.items ?? [];
  const items = all.filter((n) => !gone.includes(n.id));

  useEffect(() => {
    const live = all.map((n) => n.id);
    setGone((ids) => ids.filter((id) => live.includes(id)));
  }, [feed]);

  const failed = (e: unknown) =>
    dock.toast({ key: `notif-error:${Date.now()}`, title: "Could not clear that", body: String(e), source: "Notifications" });

  const dismiss = (ids: number[], call: Promise<unknown>) => {
    setLeaving((l) => [...l, ...ids]);
    window.setTimeout(() => {
      setGone((g) => [...g, ...ids]);
      setLeaving((l) => l.filter((id) => !ids.includes(id)));
    }, LEAVE_MS);
    call.catch((e) => {
      failed(e);
      setGone((g) => g.filter((id) => !ids.includes(id)));
      setLeaving((l) => l.filter((id) => !ids.includes(id)));
    });
  };

  const open = (n: Notif) => {
    if (n.appId) void api.launchApp(n.appId);
    dismiss([n.id], api.dismissNotification(n.id));
    dock.close();
  };

  return (
    <div className="nc">
      <div className="nc-head">
        <div style={{ fontSize: 16, fontWeight: 650 }}>Notifications</div>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-button" aria-label="Quiet hours" aria-pressed={quiet} onClick={() => setQuiet(!quiet)}>
            {quiet ? <BellOff size={16} /> : <Bell size={16} />}
          </button>
          <button className="btn small" disabled={!items.length} onClick={() => dismiss(items.map((n) => n.id), api.dismissNotification(null))}>
            Clear all
          </button>
        </div>
      </div>
      <div className="nc-list scroll">
        {feed && !feed.allowed && (
          <div className="nc-empty">
            <BellOff size={26} strokeWidth={1.4} />
            <div className="setting-label">Notifications are off for WinPad</div>
            <div className="setting-hint">Windows needs permission before other apps' notifications can show here.</div>
            <button
              className="btn primary"
              onClick={() => {
                void api.openPath("ms-settings:privacy-notifications");
                dock.close();
              }}
            >
              Open Windows Settings
            </button>
          </div>
        )}
        {feed?.allowed && !items.length && (
          <div className="nc-empty">
            <Bell size={26} strokeWidth={1.4} />
            <div className="setting-label">No new notifications</div>
          </div>
        )}
        {groups(items).map((group) => (
          <section key={group.app + group.items[0].id} className="nc-group">
            <div className="nc-app">
              {group.items[0].icon && <img src={fileSrc(group.items[0].icon)} width={16} height={16} alt="" />}
              {group.app}
            </div>
            {group.items.map((n) => (
              <article key={n.id} className="nc-item" data-leaving={leaving.includes(n.id) || undefined}>
                <button className="nc-open" onClick={() => open(n)}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                    <span className="ellipsis" style={{ fontWeight: 600 }}>
                      {n.title}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", flex: "none" }}>{shortDuration(Date.now() - n.at)}</span>
                  </div>
                  {n.body && <div className="nc-body">{n.body}</div>}
                </button>
                <button className="icon-button" aria-label="Dismiss" onClick={() => dismiss([n.id], api.dismissNotification(n.id))}>
                  <X size={14} />
                </button>
              </article>
            ))}
          </section>
        ))}
      </div>
      <div className="nc-foot">
        <span style={{ fontWeight: 600 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-button" aria-label="Less time" onClick={() => setMinutes((m) => Math.max(5, m - 5))}>
            <Minus size={14} />
          </button>
          <span style={{ width: 52, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{minutes} min</span>
          <button className="icon-button" aria-label="More time" onClick={() => setMinutes((m) => Math.min(120, m + 5))}>
            <Plus size={14} />
          </button>
          <button
            className="btn primary small"
            onClick={() => {
              startFocus(minutes);
              dock.toast({ key: `focus:${Date.now()}`, title: `Focus for ${minutes} min`, body: "Notifications stay quiet until it ends", source: "Focus" });
              dock.close();
            }}
          >
            <Play size={12} weight="Filled" /> Focus
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationsTile() {
  const dock = useDock();
  const feed = usePoll(api.notifications, 5000);
  const [quiet] = useSetting("quietHours");
  const count = feed?.items.length ?? 0;
  return (
    <Tile
      label={count ? `Notifications, ${count} new` : "Notifications"}
      tip
      active={dock.openId === "notifications"}
      style={{ gap: 5, padding: "0 10px" }}
      onClick={(anchor) => dock.toggle("notifications", anchor, <NotificationsCard />, 380)}
    >
      {quiet ? <BellOff size={dock.tile * 0.38} /> : <Bell size={dock.tile * 0.38} />}
      {count > 0 && <span className="dock-count">{count > 9 ? "9+" : count}</span>}
    </Tile>
  );
}
