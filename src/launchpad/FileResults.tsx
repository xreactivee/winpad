import type { CSSProperties, MouseEvent } from "react";
import { File, Folder } from "lucide-react";
import { fileSrc, type FileHit } from "../lib/api";

type Props = {
  files: FileHit[];
  sel: number;
  onOpen: (f: FileHit) => void;
  onContext: (e: MouseEvent, f: FileHit) => void;
  onHover?: (i: number) => void;
  style?: CSSProperties;
};

const parentOf = (path: string) => path.slice(0, path.lastIndexOf("\\")) || path;

export function FileResults({ files, sel, onOpen, onContext, onHover, style }: Props) {
  if (!files.length) return null;
  return (
    <div style={{ display: "grid", gap: 6, ...style }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", padding: "0 12px" }}>Files and Folders</div>
      <div style={{ display: "grid", gap: 2 }}>
        {files.map((f, i) => (
          <button
            key={f.path}
            ref={i === sel ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
            className="row list-item"
            aria-pressed={i === sel}
            title={f.path}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(f);
            }}
            onContextMenu={(e) => onContext(e, f)}
            onMouseEnter={() => onHover?.(i)}
            style={{ gap: 12, height: 48, padding: "0 12px", borderRadius: 10 }}
          >
            {f.icon ? (
              <img src={fileSrc(f.icon)} width={28} height={28} alt="" draggable={false} style={{ flex: "none", objectFit: "contain" }} />
            ) : f.folder ? (
              <Folder size={26} strokeWidth={1.5} style={{ flex: "none" }} />
            ) : (
              <File size={26} strokeWidth={1.5} style={{ flex: "none" }} />
            )}
            <span style={{ display: "grid", minWidth: 0 }}>
              <span className="ellipsis" style={{ fontSize: 14, fontWeight: 500 }}>
                {f.name}
              </span>
              <span className="ellipsis" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {parentOf(f.path)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
