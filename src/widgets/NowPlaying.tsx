import { Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { MouseEvent } from "react";
import { api, fileSrc, type MediaAction } from "../lib/api";
import { usePoll } from "../lib/hooks";
import type { WidgetProps } from "./shared";

function MediaControls({ playing, size = 22 }: { playing: boolean; size?: number }) {
  const act = (action: MediaAction) => (e: MouseEvent) => {
    e.stopPropagation();
    void api.mediaControl(action);
  };
  return (
    <div className="row" style={{ gap: size * 0.8 }}>
      <button aria-label="Previous" onClick={act("previous")}>
        <SkipBack size={size} fill="currentColor" />
      </button>
      <button aria-label={playing ? "Pause" : "Play"} onClick={act("toggle")}>
        {playing ? <Pause size={size * 1.25} fill="currentColor" /> : <Play size={size * 1.25} fill="currentColor" />}
      </button>
      <button aria-label="Next" onClick={act("next")}>
        <SkipForward size={size} fill="currentColor" />
      </button>
    </div>
  );
}

export function NowPlaying({ w }: WidgetProps) {
  const m = usePoll(api.mediaInfo, 2000);
  const art = m?.thumb ? fileSrc(m.thumb) : "";
  if (!m || !m.title)
    return (
      <div style={{ height: "100%", display: "grid", placeContent: "center", justifyItems: "center", gap: 8, color: "var(--text-3)" }}>
        <Music size={34} />
        <span>Nothing playing</span>
      </div>
    );
  const cover = (size: number) => (
    <div
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: 12,
        background: art ? `center/cover url("${art}")` : "linear-gradient(135deg,#ff375f,#bf5af2)",
        boxShadow: "0 6px 18px rgba(0,0,0,.4)",
        display: "grid",
        placeItems: "center",
      }}
    >
      {!art && <Music size={size * 0.4} />}
    </div>
  );
  const text = (
    <div style={{ minWidth: 0 }}>
      <div className="ellipsis" style={{ fontWeight: 650, fontSize: 14 }}>
        {m.title}
      </div>
      <div className="ellipsis" style={{ color: "var(--text-2)", fontSize: 12 }}>
        {m.artist}
      </div>
    </div>
  );
  if (w.size === "s")
    return (
      <div style={{ height: "100%", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {cover(64)}
        {text}
        <div style={{ marginTop: "auto" }}>
          <MediaControls playing={m.playing} size={18} />
        </div>
      </div>
    );
  return (
    <div style={{ height: "100%", padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
      {cover(130)}
      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 16 }}>
        {text}
        <MediaControls playing={m.playing} />
      </div>
    </div>
  );
}
