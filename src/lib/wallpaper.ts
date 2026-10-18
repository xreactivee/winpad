import { useEffect, useState, type CSSProperties } from "react";
import { api, fileSrc, listen, type Wallpaper } from "./api";

type WallpaperImage = { url: string; blurred: string };

let current: WallpaperImage = { url: "", blurred: "" };
const subscribers = new Set<(w: WallpaperImage) => void>();
let started = false;

function blurredCopy(img: HTMLImageElement): Promise<string> {
  const w = 160;
  const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "blur(3px) saturate(1.6) brightness(0.92)";
  ctx.drawImage(img, -8, -8, w + 16, h + 16);
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : ""), "image/png");
    } catch {
      resolve("");
    }
  });
}

function loadWallpaper(wp: Wallpaper | null) {
  if (!wp) return;
  const url = `${fileSrc(wp.path)}?v=${wp.version}`;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = async () => {
    const blurred = await blurredCopy(img);
    if (current.blurred) URL.revokeObjectURL(current.blurred);
    current = { url, blurred };
    subscribers.forEach((fn) => fn(current));
  };
  img.src = url;
}

export function useWallpaper() {
  const [wallpaper, setWallpaper] = useState(current);
  useEffect(() => {
    subscribers.add(setWallpaper);
    if (!started) {
      started = true;
      api.wallpaper().then(loadWallpaper).catch(() => {});
      listen<Wallpaper>("wallpaper-changed", loadWallpaper);
    }
    return () => void subscribers.delete(setWallpaper);
  }, []);
  return wallpaper;
}

export const frosted = (blurred: string): CSSProperties => ({
  backgroundImage: `linear-gradient(160deg, rgba(64,64,72,.42), rgba(18,18,22,.5))${blurred ? `, url("${blurred}")` : ""}`,
  backgroundSize: "auto, cover",
  backgroundPosition: "center",
  backgroundAttachment: "fixed",
  backgroundColor: blurred ? undefined : "rgba(30,30,34,.92)",
});
