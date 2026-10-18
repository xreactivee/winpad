import type { MouseEvent } from "react";
import { ChevronLeft } from "lucide-react";
import type { App } from "../lib/api";
import type { Group } from "../lib/categories";
import { AppIcon } from "../components/AppIcon";
import { AppTile } from "../components/AppTile";
import { Glass } from "../components/Glass";

type Props = {
  groups: Group[];
  size: number;
  onLaunch: (a: App) => void;
  onOpen: (g: Group) => void;
  onAppContext: (e: MouseEvent, a: App) => void;
};

export function AppLibrary({ groups, size, onLaunch, onOpen, onAppContext }: Props) {
  const big = size * 0.36;
  return (
    <div
      className="scroll"
      style={{ height: "100%", display: "grid", gridTemplateColumns: `repeat(4, ${size}px)`, justifyContent: "center", alignContent: "start", gap: `${size * 0.16}px ${size * 0.2}px`, paddingTop: 8 }}
    >
      {groups.map((g) => {
        const showAll = g.apps.length <= 4;
        const first = g.apps.slice(0, showAll ? 4 : 3);
        const rest = g.apps.slice(3, 7);
        const veiled = g.key === "hidden";
        const open = (e: MouseEvent) => {
          e.stopPropagation();
          onOpen(g);
        };
        return (
          <div key={g.key} style={{ display: "grid", justifyItems: "center", gap: 7 }}>
            <Glass
              liquid
              radius={size * 0.2}
              onClick={open}
              style={{ width: size, height: size, padding: size * 0.09, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", placeItems: "center" }}
            >
              {first.map((a) => (
                <button
                  key={a.id}
                  title={a.name}
                  onClick={(e) => {
                    if (veiled) return open(e);
                    e.stopPropagation();
                    onLaunch(a);
                  }}
                  onContextMenu={(e) => onAppContext(e, a)}
                  style={{ filter: veiled ? "blur(6px)" : undefined }}
                >
                  <AppIcon app={a} size={big} />
                </button>
              ))}
              {!showAll && (
                <button
                  aria-label={`Open ${g.name}`}
                  onClick={open}
                  style={{ width: big, height: big, display: "grid", gridTemplateColumns: "1fr 1fr", gap: big * 0.1, padding: big * 0.04, filter: veiled ? "blur(6px)" : undefined }}
                >
                  {rest.map((a) => (
                    <AppIcon key={a.id} app={a} size={big * 0.43} />
                  ))}
                </button>
              )}
              {!g.apps.length &&
                Array.from({ length: 4 }, (_, i) => <div key={i} style={{ width: big, height: big, borderRadius: big * 0.225, background: "rgba(255,255,255,.1)" }} />)}
            </Glass>
            <span className="app-label">{g.name}</span>
          </div>
        );
      })}
    </div>
  );
}

type CategoryProps = {
  group: Group;
  icon: number;
  cell: number;
  onBack: () => void;
  onLaunch: (a: App) => void;
  onAppContext: (e: MouseEvent, a: App) => void;
};

export function CategoryView({ group, icon, cell, onBack, onLaunch, onAppContext }: CategoryProps) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", animation: "fade-in .2s" }}>
      <button
        className="row"
        onClick={(e) => {
          e.stopPropagation();
          onBack();
        }}
        style={{ alignSelf: "center", gap: 2, fontSize: 26, fontWeight: 600, margin: "0 0 18px", textShadow: "0 2px 10px rgba(0,0,0,.4)" }}
      >
        <ChevronLeft size={30} strokeWidth={2.5} /> {group.name}
      </button>
      <div className="scroll" style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(auto-fill, ${cell}px)`, gridAutoRows: cell, justifyContent: "center", alignContent: "start" }}>
        {group.apps.map((a) => (
          <AppTile key={a.id} app={a} icon={icon} width={cell} height={cell} onLaunch={onLaunch} onContext={onAppContext} />
        ))}
        {!group.apps.length && <div className="empty-note">This category is empty</div>}
      </div>
    </div>
  );
}
