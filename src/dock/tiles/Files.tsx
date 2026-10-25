import { Download, Image, Trash2 } from "reicon-react";
import { useCallback, type MouseEvent } from "react";
import { api, fileSrc, type KnownFolder, type RecentFile } from "../../lib/api";
import { usePoll } from "../../lib/hooks";
import { shortDuration } from "../../lib/time";
import { formatBytes } from "../../lib/util";
import { openMenu } from "../../components/ContextMenu";
import { useDock } from "../state";
import { Card, Tile } from "../Tile";

const useRecent = (folder: KnownFolder, count: number) =>
  usePoll(
    useCallback(() => api.recentFiles(folder, count), [folder, count]),
    15_000,
  );

const fileMenu = (f: RecentFile) => (e: MouseEvent) =>
  openMenu(e, [
    { label: "Open", onClick: () => api.openPath(f.path) },
    { label: "Show in Explorer", onClick: () => api.revealApp(f.path) },
  ]);

function DownloadsCard() {
  const dock = useDock();
  const files = useRecent("downloads", 8) ?? [];
  return (
    <Card title="Downloads">
      <div style={{ display: "grid", gap: 2 }}>
        {files.map((f) => (
          <button
            key={f.path}
            className="list-item row"
            style={{ gap: 10 }}
            onContextMenu={fileMenu(f)}
            onClick={() => {
              void api.openPath(f.path);
              dock.close();
            }}
          >
            {f.icon ? <img src={fileSrc(f.icon)} width={24} height={24} alt="" /> : <Download size={20} />}
            <span className="ellipsis" style={{ flex: 1, textAlign: "left" }}>
              {f.name}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{shortDuration(Date.now() - f.modified)}</span>
          </button>
        ))}
        {!files.length && <div style={{ color: "var(--text-3)" }}>Nothing downloaded yet</div>}
      </div>
    </Card>
  );
}

export function DownloadsTile() {
  const dock = useDock();
  const latest = useRecent("downloads", 1)?.[0];
  return (
    <Tile label="Downloads" tip style={{ gap: 8, padding: "0 12px", maxWidth: 200 }} onClick={(anchor) => dock.toggle("downloads", anchor, <DownloadsCard />, 340)}>
      <Download size={dock.tile * 0.4} />
      {latest && (
        <span className="ellipsis" style={{ fontSize: dock.tile * 0.25, fontWeight: 600 }}>
          {latest.name}
        </span>
      )}
    </Tile>
  );
}

function ScreenshotsCard() {
  const dock = useDock();
  const shots = useRecent("screenshots", 6) ?? [];
  return (
    <Card title="Screenshots" action={<button className="btn small" onClick={() => api.openPath("ms-screenclip:")}>New…</button>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {shots.map((f) => (
          <button
            key={f.path}
            aria-label={f.name}
            onContextMenu={fileMenu(f)}
            onClick={() => {
              void api.openPath(f.path);
              dock.close();
            }}
            style={{ aspectRatio: "16 / 10", borderRadius: 8, background: `center/cover url("${fileSrc(f.path)}") var(--fill)` }}
          />
        ))}
      </div>
      {!shots.length && <div style={{ color: "var(--text-3)" }}>No screenshots yet</div>}
    </Card>
  );
}

export function ScreenshotsTile() {
  const dock = useDock();
  const latest = useRecent("screenshots", 1)?.[0];
  const size = Math.round(dock.tile * 0.74);
  return (
    <Tile label="Screenshots" tip style={{ padding: "0 6px" }} onClick={(anchor) => dock.toggle("screenshots", anchor, <ScreenshotsCard />, 360)}>
      {latest ? (
        <span style={{ width: size * 1.5, height: size, borderRadius: 6, background: `center/cover url("${fileSrc(latest.path)}")` }} />
      ) : (
        <Image size={dock.tile * 0.4} />
      )}
    </Tile>
  );
}

export function RecycleBinTile() {
  const dock = useDock();
  const bin = usePoll(api.recycleBin, 10_000);
  const full = !!bin && bin.items > 0;
  return (
    <Tile
      label={full ? `Recycle Bin, ${bin.items} items, ${formatBytes(bin.bytes)}` : "Recycle Bin"}
      tip
      style={{ gap: 6, padding: "0 10px" }}
      onClick={() => api.openPath("shell:RecycleBinFolder")}
      onContextMenu={(e) =>
        openMenu(e, [
          { label: "Open", onClick: () => api.openPath("shell:RecycleBinFolder") },
          { label: "Empty Recycle Bin…", danger: true, disabled: !full, onClick: () => api.emptyRecycleBin() },
        ])
      }
    >
      <Trash2 size={dock.tile * 0.4} weight={full ? "Filled" : undefined} />
      {full && <span style={{ fontSize: dock.tile * 0.25, fontWeight: 600 }}>{bin.items}</span>}
    </Tile>
  );
}
