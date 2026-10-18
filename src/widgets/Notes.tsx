import { useEffect, useRef, useState } from "react";
import type { WidgetProps } from "./shared";

export function Notes({ w, setOptions, preview }: WidgetProps) {
  const [text, setText] = useState<string>(w.options.text ?? "");
  const timer = useRef(0);
  useEffect(() => setText(w.options.text ?? ""), [w.options.text]);
  const tint: string = w.options.tint ?? "glass";
  const save = (v: string) => {
    setText(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOptions({ text: v }), 500);
  };
  const colored = tint !== "glass";
  return (
    <div
      style={{
        height: "100%",
        padding: 14,
        background: colored ? `linear-gradient(160deg, ${tint}e6, ${tint}b3)` : undefined,
        color: colored ? "#1c1c1e" : undefined,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <textarea
        value={text}
        readOnly={preview}
        placeholder="Write a note…"
        onChange={(e) => save(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        spellCheck={false}
        style={{
          flex: 1,
          resize: "none",
          border: 0,
          outline: "none",
          background: "transparent",
          fontSize: w.size === "s" ? 14 : 15,
          fontWeight: 500,
          lineHeight: 1.4,
          color: "inherit",
          userSelect: "text",
        }}
      />
    </div>
  );
}
