import type { CSSProperties } from "react";
import { useWallpaper } from "../lib/wallpaper";

export function Backdrop({ dim, style }: { dim: number; style?: CSSProperties }) {
  const { url, blurred } = useWallpaper();
  return (
    <>
      <div
        className={url ? undefined : "wallpaper-fallback"}
        style={{
          position: "absolute",
          inset: blurred ? 0 : -60,
          backgroundImage: url ? `url("${blurred || url}")` : undefined,
          filter: url && !blurred ? "blur(34px) saturate(1.5)" : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          ...style,
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dim})` }} />
    </>
  );
}
