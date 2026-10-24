import { useState, type MouseEvent, type RefObject } from "react";
import { Minus, Search } from "reicon-react";
import type { App, FileHit } from "../lib/api";
import type { Group } from "../lib/categories";
import { frosted } from "../lib/wallpaper";
import { AppTile } from "../components/AppTile";
import { Logo } from "../components/Logo";
import { FileResults } from "./FileResults";

type Props = {
  apps: App[];
  groups: Group[];
  results: App[];
  files: FileHit[];
  sel: number;
  query: string;
  setQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  wallpaper: string;
  onLaunch: (a: App) => void;
  onAppContext: (e: MouseEvent, a: App) => void;
  onOpenFile: (f: FileHit) => void;
  onFileContext: (e: MouseEvent, f: FileHit) => void;
  onClose: () => void;
};

export const WINDOW_H = "min(620px, 84vh)";

const ICON = 56;
const CELL_W = 98;
const CELL_H = 96;

export function AppWindow({ apps, groups, results, files, sel, query, setQuery, searchRef, wallpaper, onLaunch, onAppContext, onOpenFile, onFileContext, onClose }: Props) {
  const [chip, setChip] = useState<string | null>(null);
  const categories = groups.filter((g) => g.key !== "recent" && g.key !== "hidden");
  const recent = groups.find((g) => g.key === "recent")?.apps ?? [];
  const picked = chip ? categories.find((g) => g.key === chip) : undefined;
  const list = query ? results : picked ? picked.apps : apps;
  const chips = [{ key: null as string | null, name: "All" }, ...categories.map((g) => ({ key: g.key as string | null, name: g.name }))];

  const tile = (a: App, i: number, selected = false) => (
    <AppTile
      key={a.id}
      app={a}
      icon={ICON}
      width={CELL_W}
      height={CELL_H}
      selected={selected}
      onLaunch={onLaunch}
      onContext={onAppContext}
      style={{ animation: `fade-in .25s ${Math.min(i, 20) * 0.012}s both` }}
    />
  );

  return (
    <div
      className="glass"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "relative",
        flex: "none",
        width: "min(860px, 92vw)",
        height: WINDOW_H,
        ["--r" as string]: "26px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...frosted(wallpaper),
        animation: "pop-in .22s cubic-bezier(.2,.9,.3,1.1)",
      }}
    >
      <div className="row" style={{ padding: "16px 18px 10px", gap: 10 }}>
        <Logo size={22} style={{ borderRadius: 6 }} />
        <span style={{ fontSize: 19, fontWeight: 650, letterSpacing: -0.2 }}>Applications</span>
        <label className="row inset-field" style={{ marginLeft: "auto", gap: 6, width: 220, height: 28, padding: "0 10px" }}>
          <Search size={13} color="var(--text-2)" />
          <input ref={searchRef} value={query} placeholder="Search" spellCheck={false} onChange={(e) => setQuery(e.target.value)} className="bare-input" style={{ flex: 1, fontSize: 12 }} />
        </label>
        <button aria-label="Close" onClick={onClose} style={{ width: 22, height: 22, borderRadius: 11, display: "grid", placeItems: "center", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.55)" }}>
          <Minus size={13} strokeWidth={3} />
        </button>
      </div>

      {!query && (
        <div className="row" style={{ gap: 6, padding: "0 18px 12px", overflowX: "auto", flex: "none", scrollbarWidth: "none" }}>
          {chips.map((c) => (
            <button key={c.key ?? "all"} className="chip" aria-pressed={chip === c.key} onClick={() => setChip(c.key)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="scroll" style={{ flex: 1, padding: "0 12px 16px" }}>
        {!query && !chip && recent.length > 0 && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>{recent.slice(0, 8).map((a, i) => tile(a, i))}</div>
            <div style={{ height: 1, margin: "6px 12px 8px", background: "var(--sep)" }} />
          </>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${CELL_W}px)`, justifyContent: "center" }}>{list.map((a, i) => tile(a, i, !!query && i === sel))}</div>
        {query && <FileResults files={files} sel={sel - results.length} onOpen={onOpenFile} onContext={onFileContext} style={{ margin: "10px 6px 0" }} />}
        {query && !results.length && !files.length && <div className="empty-note">No results</div>}
      </div>
    </div>
  );
}
