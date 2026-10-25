import { Music, Pause, Play } from "reicon-react";
import { api, fileSrc } from "../../lib/api";
import { usePoll } from "../../lib/hooks";
import { newWidget } from "../../widgets/registry";
import { BASE } from "../../widgets/shared";
import { NowPlaying } from "../../widgets/NowPlaying";
import { useDock } from "../state";
import { Tile } from "../Tile";

const noop = () => {};

export function MediaCard() {
  return (
    <div style={{ width: BASE.m.w, height: BASE.m.h, margin: -16 }}>
      <NowPlaying w={newWidget("media", "m", "default", "dock-media")} setOptions={noop} />
    </div>
  );
}

export function MediaTile() {
  const dock = useDock();
  const m = usePoll(api.mediaInfo, 2000);
  const art = m?.thumb ? fileSrc(m.thumb) : "";
  const cover = Math.round(dock.tile * 0.74);
  if (!m?.title)
    return (
      <Tile label="Now playing" style={{ gap: 8, padding: "0 12px", color: "var(--dock-fg-2)" }}>
        <Music size={dock.tile * 0.4} />
        <span style={{ fontSize: dock.tile * 0.25 }}>Nothing playing</span>
      </Tile>
    );
  return (
    <Tile label="Now playing" style={{ gap: 8, padding: "0 6px", maxWidth: 240 }} onClick={(anchor) => dock.toggle("media", anchor, <MediaCard />, BASE.m.w)}>
      <span
        style={{
          width: cover,
          height: cover,
          flex: "none",
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: art ? `center/cover url("${art}")` : "linear-gradient(135deg,#ff375f,#bf5af2)",
        }}
      >
        {!art && <Music size={cover * 0.45} />}
      </span>
      <span className="dock-sub" style={{ display: "grid", minWidth: 0, textAlign: "left" }}>
        <span className="ellipsis" style={{ fontWeight: 650, fontSize: dock.tile * 0.26 }}>
          {m.title}
        </span>
        <span className="ellipsis" style={{ fontSize: dock.tile * 0.22, color: "var(--dock-fg-2)" }}>
          {m.artist}
        </span>
      </span>
      <span
        role="button"
        aria-label={m.playing ? "Pause" : "Play"}
        className="dock-toggle"
        onClick={(e) => {
          e.stopPropagation();
          void api.mediaControl("toggle");
        }}
      >
        {m.playing ? <Pause size={dock.tile * 0.34} weight="Filled" /> : <Play size={dock.tile * 0.34} weight="Filled" />}
      </span>
    </Tile>
  );
}
