import type { CSSProperties, MouseEvent } from "react";
import type { App } from "../lib/api";
import { AppIcon } from "./AppIcon";

type Props = {
  app: App;
  icon: number;
  width: number;
  height?: number;
  selected?: boolean;
  style?: CSSProperties;
  onLaunch: (a: App) => void;
  onContext: (e: MouseEvent, a: App) => void;
  onHover?: () => void;
};

export function AppTile({ app, icon, width, height, selected, style, onLaunch, onContext, onHover }: Props) {
  return (
    <button
      className={`app-tile${selected ? " selected" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onLaunch(app);
      }}
      onContextMenu={(e) => onContext(e, app)}
      onMouseEnter={onHover}
      style={{ width, height, ...style }}
    >
      <AppIcon app={app} size={icon} />
      <span className="app-label" style={{ maxWidth: width - 8 }}>
        {app.name}
      </span>
    </button>
  );
}
