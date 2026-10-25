import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { X } from "reicon-react";
import { api, listen } from "../lib/api";
import { useApps } from "../lib/apps";
import { decide, type Toast } from "../lib/automations";
import { DOCK_GAP, DOCK_HEIGHT, DOCK_INSET, DOCK_VERSION, migrate, moveItem, pinsFromTaskbar, withoutItem } from "../lib/dock";
import { usePoll } from "../lib/hooks";
import { useSettings, type DockStyle } from "../lib/settings";
import { pad } from "../lib/time";
import { clamp } from "../lib/util";
import { useWallpaper } from "../lib/wallpaper";
import { closeMenu, openMenu, useMenuOpen, type MenuItem } from "../components/ContextMenu";
import { usePomodoroRunner } from "./tiles/Focus";
import { CalendarCard } from "./tiles/Time";
import { useForecast } from "./tiles/Insights";
import { tileDef } from "./registry";
import { DockContext, useCalendarEvents, useDockLayout, type DockApi } from "./state";

type Pop = { id: string; anchor: DOMRect; node: ReactNode; width: number };
type Label = { anchor: DOMRect; text: string };
type Drag = { id: string; dx: number; to: number };

const TOAST_MS = 10_000;
const HIDE_DELAY = 700;

function offsetRect(el: HTMLElement) {
  let [x, y] = [0, 0];
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return [x, y, el.offsetWidth, el.offsetHeight];
}

const boxRect = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return [r.left, r.top, r.width, r.height];
};

function surface(style: DockStyle, sharp: string, blurred: string, origin: { x: number; y: number }, bar: DOMRect | null): CSSProperties {
  if (!bar || !["glass", "liquid", "tinted"].includes(style)) return {};
  const image = style === "liquid" ? sharp : blurred;
  if (!image) return {};
  const tint =
    style === "tinted"
      ? "linear-gradient(rgba(26,28,44,.46), rgba(26,28,44,.46))"
      : "linear-gradient(150deg, rgba(255,255,255,.17), rgba(255,255,255,.05) 45%, rgba(255,255,255,.11))";
  return {
    backgroundImage: `${tint}, url("${image}")`,
    backgroundSize: `auto, ${screen.width}px ${screen.height}px`,
    backgroundPosition: `0 0, ${-(origin.x + bar.left)}px ${-(origin.y + bar.top)}px`,
  };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function ToastCard({ toast, onClose, onOpen }: { toast: Toast; onClose: () => void; onOpen?: () => void }) {
  return (
    <div className="dock-toast glass solid" role="status">
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.3 }}>{toast.source}</div>
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650 }}>{toast.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-2)" }}>{toast.body}</div>
        </div>
        {onOpen && (
          <button className="btn small" onClick={onOpen}>
            Calendar
          </button>
        )}
        <button className="icon-button" aria-label="Dismiss" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function Dock() {
  const [settings, setSettings] = useSettings();
  const [layout, setLayout] = useDockLayout();
  const apps = useApps();
  const { url, blurred } = useWallpaper();
  const events = useCalendarEvents(settings.dock ? settings.calendars : []);
  const forecast = useForecast();
  const aiFetch = useCallback(() => (settings.dock && settings.autoAiLimit ? api.aiUsage() : Promise.resolve(null)), [settings.dock, settings.autoAiLimit]);
  const ai = usePoll(aiFetch, 60_000);
  const menuOpen = useMenuOpen();
  const [pop, setPop] = useState<Pop | null>(null);
  const [label, setLabel] = useState<Label | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [regionHidden, setRegionHidden] = useState(false);
  const [compact, setCompact] = useState(false);
  const [origin, setOrigin] = useState({ x: window.screenX, y: window.screenY });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [, setTick] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<string, HTMLDivElement>());
  const panels = useRef<ResizeObserver | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const hideTimer = useRef(0);
  const region = useRef("");
  const fired = useRef(new Set<string>());

  const height = DOCK_HEIGHT[settings.dockSize];
  const tile = height - 10;
  const edge = settings.dockEdge;
  const transient = !!pop || menuOpen;
  const hidden = settings.dockAutoHide && !revealed && !transient;
  const bar = barRef.current?.getBoundingClientRect() ?? null;

  useEffect(() => {
    if (!hidden) {
      setRegionHidden(false);
      return;
    }
    const id = window.setTimeout(() => setRegionHidden(true), 320);
    return () => window.clearTimeout(id);
  }, [hidden]);

  useEffect(() => {
    if (settings.dock && (layout.version ?? 0) < DOCK_VERSION) setLayout(migrate);
  }, [settings.dock, layout.version, setLayout]);

  useEffect(() => {
    if (!settings.dock || layout.seeded || !apps.length) return;
    api
      .taskbarPins()
      .then((names) => setLayout((l) => ({ ...l, pins: [...new Set([...l.pins, ...pinsFromTaskbar(names, apps)])], seeded: true })))
      .catch(() => {});
  }, [settings.dock, layout.seeded, apps, setLayout]);

  useEffect(() => {
    const update = () => requestAnimationFrame(() => setOrigin({ x: window.screenX, y: window.screenY }));
    const bump = () => setTick((t) => t + 1);
    update();
    const off = listen("dock-placed", update);
    const ro = new ResizeObserver(bump);
    if (barRef.current) ro.observe(barRef.current);
    window.addEventListener("resize", update);
    return () => {
      off();
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [settings.dock]);

  useEffect(
    () =>
      listen("dock-dismiss", () => {
        setPop(null);
        closeMenu();
      }),
    [],
  );

  useEffect(() => {
    void api.dockPopover(transient);
  }, [transient]);

  useLayoutEffect(() => {
    const observer = (panels.current ??= new ResizeObserver(() => setTick((t) => t + 1)));
    observer.disconnect();
    for (const el of [popRef.current, toastRef.current, labelRef.current]) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [pop?.id, toasts.length, label?.text]);

  useLayoutEffect(() => {
    const el = barRef.current;
    const row = el?.parentElement;
    if (!el || !row) return;
    if (!compact && el.scrollWidth > el.clientWidth + 1) setCompact(true);
    else if (compact && row.clientWidth - el.clientWidth > 200) setCompact(false);
  });

  useLayoutEffect(() => {
    if (!settings.dock) return;
    const rects: number[][] = [];
    if (regionHidden) rects.push([0, edge === "bottom" ? innerHeight - 4 : 0, innerWidth, 4]);
    else if (barRef.current) rects.push(offsetRect(barRef.current));
    if (menuOpen) rects.push([0, 0, innerWidth, innerHeight]);
    if (popRef.current) rects.push(offsetRect(popRef.current));
    if (toastRef.current) rects.push(offsetRect(toastRef.current));
    if (labelRef.current) rects.push(boxRect(labelRef.current));
    const key = JSON.stringify(rects.map((r) => r.map(Math.round)));
    if (key !== region.current) {
      region.current = key;
      void api.dockRegion(rects);
    }
  });

  const pushToast = useCallback((t: Toast) => {
    setToasts((list) => (list.some((x) => x.key === t.key) ? list : [...list.slice(-2), t]));
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.key !== t.key)), TOAST_MS);
  }, []);

  usePomodoroRunner(pushToast);

  useEffect(() => {
    if (!settings.dock) return;
    const run = async () => {
      const [media, battery, stats, dark] = await Promise.all([
        api.mediaInfo().catch(() => null),
        settings.autoHealth ? api.battery().catch(() => null) : null,
        settings.autoHealth ? api.sysStats().catch(() => null) : null,
        settings.autoSunset ? api.darkTheme().catch(() => null) : null,
      ]);
      const day = forecast?.daily.find((d) => d.date === today());
      const { actions, keys } = decide(
        {
          now: Date.now(),
          events,
          playing: !!media?.playing,
          codex: ai?.codex ?? null,
          battery,
          storageFree: stats ? 1 - stats.diskUsed / Math.max(1, stats.diskTotal) : null,
          sun: day?.sunrise && day.sunset ? { sunrise: day.sunrise, sunset: day.sunset } : null,
          dark,
        },
        settings,
        fired.current,
      );
      keys.forEach((k) => fired.current.add(k));
      for (const a of actions) {
        if (a.kind === "toast") pushToast(a.toast);
        else if (a.kind === "pauseMedia") void api.mediaControl("toggle");
        else void api.setDarkTheme(a.dark);
      }
    };
    void run();
    const id = setInterval(run, 30_000);
    return () => clearInterval(id);
  }, [settings, events, forecast, ai, pushToast]);

  if (!settings.dock) return null;

  const dock: DockApi = {
    tile,
    edge,
    labels: settings.dockLabels,
    events,
    openId: pop?.id ?? null,
    toggle: (id, anchor, node, width = 320) => {
      setLabel(null);
      setPop((p) => (p?.id === id ? null : { id, anchor: anchor.getBoundingClientRect(), node, width }));
    },
    close: () => setPop(null),
    toast: pushToast,
    label: (anchor, text) => setLabel(anchor && text && !pop && !drag ? { anchor: anchor.getBoundingClientRect(), text } : null),
  };

  const dockMenu: MenuItem[] = [
    { label: "Add Item…", onClick: () => api.openSettings("taskbar") },
    { label: settings.dockLocked ? "Unlock Dock" : "Lock Dock", onClick: () => setSettings((s) => ({ ...s, dockLocked: !s.dockLocked })) },
    { label: "Dock Settings…", onClick: () => api.openSettings("taskbar") },
  ];

  const slotMenu = (e: MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setLabel(null);
    openMenu(e, [{ label: `Remove ${name}`, onClick: () => setLayout((l) => withoutItem(l, id)) }, { separator: true }, ...dockMenu]);
  };

  const startDrag = (e: PointerEvent, id: string) => {
    suppressClick.current = false;
    if (settings.dockLocked || e.button !== 0) return;
    const x0 = e.clientX;
    const move = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!dragRef.current && Math.abs(dx) < 6) return;
      const others = layout.items.filter((it) => it.id !== id);
      const to = others.filter((it) => {
        const r = slots.current.get(it.id)?.getBoundingClientRect();
        return r ? r.left + r.width / 2 < ev.clientX : false;
      }).length;
      dragRef.current = { id, dx, to };
      setDrag(dragRef.current);
      setLabel(null);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (d) {
        suppressClick.current = true;
        setLayout((l) => moveItem(l, d.id, d.to));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const popLeft = pop ? clamp(pop.anchor.left + pop.anchor.width / 2 - pop.width / 2, 8, innerWidth - pop.width - 8) : 0;
  const away = bar ? (edge === "bottom" ? { bottom: innerHeight - bar.top + DOCK_GAP } : { top: bar.bottom + DOCK_GAP }) : {};
  const popMax = bar ? Math.max(220, (edge === "bottom" ? bar.top : innerHeight - bar.bottom) - DOCK_GAP - 12) : 420;
  const calendarToast = (t: Toast) =>
    t.calendar && barRef.current
      ? () => {
          setToasts((list) => list.filter((x) => x.key !== t.key));
          dock.toggle("calendar", barRef.current!, <CalendarCard />, 320);
        }
      : undefined;

  return (
    <DockContext.Provider value={dock}>
      <div
        className="dock-root"
        data-edge={edge}
        data-style={settings.dockStyle}
        data-compact={compact || undefined}
        style={{ "--accent": settings.dockAccent, "--tile": `${tile}px` } as CSSProperties}
      >
        {settings.dockAutoHide && <div className="dock-reveal" style={{ [edge]: 0 }} onPointerEnter={() => setRevealed(true)} />}
        <div className="dock-row" data-width={settings.dockWidth} style={{ [edge]: DOCK_INSET }}>
          <div
            ref={barRef}
            className="dock-bar"
            data-hidden={hidden || undefined}
            style={{ height, borderRadius: Math.round(height * 0.32) }}
            onContextMenu={(e) => openMenu(e, dockMenu)}
            onPointerEnter={() => window.clearTimeout(hideTimer.current)}
            onPointerLeave={() => {
              setLabel(null);
              if (settings.dockAutoHide) hideTimer.current = window.setTimeout(() => setRevealed(false), HIDE_DELAY);
            }}
          >
            <div className="dock-surface" style={surface(settings.dockStyle, url, blurred, origin, bar)} />
            {layout.items.map((item) => {
              const def = tileDef(item.type);
              if (!def) return null;
              const Component = def.component;
              const dragged = drag?.id === item.id;
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    if (el) slots.current.set(item.id, el);
                    else slots.current.delete(item.id);
                  }}
                  className="dock-slot"
                  data-type={item.type}
                  data-dragging={dragged || undefined}
                  style={dragged ? { transform: `translateX(${drag.dx}px)` } : undefined}
                  onPointerDown={(e) => startDrag(e, item.id)}
                  onClickCapture={(e) => {
                    if (!suppressClick.current) return;
                    suppressClick.current = false;
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onContextMenu={(e) => slotMenu(e, item.id, def.name)}
                >
                  <Component />
                </div>
              );
            })}
          </div>
        </div>
        {pop && (
          <div ref={popRef} className="dock-pop glass solid" style={{ left: popLeft, width: pop.width, maxHeight: popMax, ...away }}>
            {pop.node}
          </div>
        )}
        {toasts.length > 0 && (
          <div ref={toastRef} className="dock-toasts" style={{ right: bar ? Math.max(12, innerWidth - bar.right) : 12, ...away }}>
            {toasts.map((t) => (
              <ToastCard key={t.key} toast={t} onClose={() => setToasts((list) => list.filter((x) => x.key !== t.key))} onOpen={calendarToast(t)} />
            ))}
          </div>
        )}
        {label && bar && (
          <div ref={labelRef} className="dock-label" style={{ left: label.anchor.left + label.anchor.width / 2, ...(edge === "bottom" ? { bottom: innerHeight - bar.top + 8 } : { top: bar.bottom + 8 }) }}>
            {label.text}
          </div>
        )}
      </div>
    </DockContext.Provider>
  );
}
