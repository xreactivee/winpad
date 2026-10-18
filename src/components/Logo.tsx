import type { CSSProperties } from "react";

export function Logo({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  return (
    <img
      src="/logo.svg"
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={className}
      style={style}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
