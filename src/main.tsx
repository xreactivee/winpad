import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import "./styles/glass.css";
import "./styles/controls.css";
import "./styles/settings.css";
import "./styles/dock.css";
import { windowLabel } from "./lib/api";
import { useSetting } from "./lib/settings";
import { ContextMenuHost } from "./components/ContextMenu";
import { Dock } from "./dock/Dock";
import { Launchpad } from "./launchpad/Launchpad";
import { Settings } from "./settings/Settings";

function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <filter id="liquid-glass" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="11" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2.5" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="34" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="liquid-dock" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.012" numOctaves="2" seed="7" result="dockNoise" />
        <feGaussianBlur in="dockNoise" stdDeviation="3" result="dockSoft" />
        <feDisplacementMap in="SourceGraphic" in2="dockSoft" scale="8" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

function Root() {
  const [refraction] = useSetting("liquidRefraction");
  useEffect(() => {
    document.body.classList.toggle("refraction", refraction);
  }, [refraction]);
  useEffect(() => {
    const block = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", block);
    return () => window.removeEventListener("contextmenu", block);
  }, []);
  return (
    <>
      <SvgDefs />
      {windowLabel === "settings" ? <Settings /> : windowLabel === "dock" ? <Dock /> : <Launchpad />}
      <ContextMenuHost />
    </>
  );
}

document.documentElement.dataset.window = windowLabel;
createRoot(document.getElementById("root")!).render(<Root />);
