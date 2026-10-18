import { fileSrc, type App } from "../lib/api";
import { useSetting, type IconStyle } from "../lib/settings";

export function AppIcon({ app, size, variant }: { app?: App | null; size: number; variant?: IconStyle }) {
  const [iconStyle] = useSetting("iconStyle");
  const src = fileSrc(app?.icon);
  const glass = (variant ?? iconStyle) === "glass";
  const inner = glass ? size * 0.74 : size;
  return (
    <div className={glass ? "icon-glass" : undefined} style={{ width: size, height: size, flex: "none", display: "grid", placeItems: "center", borderRadius: size * 0.225, position: "relative" }}>
      {src ? (
        <img src={src} width={inner} height={inner} alt="" draggable={false} style={{ objectFit: "contain" }} />
      ) : (
        <span style={{ fontSize: size * 0.42, fontWeight: 600, opacity: 0.85 }}>{app?.name?.[0] ?? "?"}</span>
      )}
    </div>
  );
}
