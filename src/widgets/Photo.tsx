import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { api, fileSrc } from "../lib/api";
import type { WidgetProps } from "./shared";

export function Photo({ w }: WidgetProps) {
  const folder: string = w.options.folder ?? "";
  const [images, setImages] = useState<string[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!folder) return setImages([]);
    void api.listImages(folder).then((list) => setImages(list ?? []));
  }, [folder]);
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % images.length), Math.max(5, w.options.interval ?? 30) * 1000);
    return () => clearInterval(id);
  }, [images, w.options.interval]);

  if (!images.length)
    return (
      <div style={{ height: "100%", display: "grid", placeContent: "center", justifyItems: "center", gap: 8, color: "var(--text-2)", textAlign: "center", padding: 12 }}>
        <ImageIcon size={32} />
        <span style={{ fontSize: 12 }}>{folder ? "No photos in this folder" : "Right-click › Edit Widget to pick a folder"}</span>
      </div>
    );
  const framed = w.style === "framed";
  return (
    <div style={{ height: "100%", padding: framed ? 12 : 0, position: "relative" }}>
      {images.map((src, idx) => (
        <div
          key={src}
          style={{
            position: "absolute",
            inset: framed ? 12 : 0,
            borderRadius: framed ? 14 : 0,
            background: `center/cover url("${fileSrc(src)}")`,
            opacity: idx === i ? 1 : 0,
            transition: "opacity 1.2s ease",
            display: Math.abs(idx - i) <= 1 || idx === 0 ? undefined : "none",
          }}
        />
      ))}
    </div>
  );
}
