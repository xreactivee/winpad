const SAMPLE_APPS = [
  "App Store", "Calculator", "Calendar", "ChatGPT", "Chrome", "Discord", "Edge", "Excel", "Figma",
  "File Explorer", "GitHub Desktop", "Mail", "Maps", "Notepad", "Notion", "OBS Studio", "Obsidian",
  "Outlook", "Paint", "Photos", "PowerPoint", "Settings", "Slack", "Spotify", "Steam", "Telegram",
  "Terminal", "Visual Studio Code", "VLC", "WhatsApp", "Word", "Xbox", "Zoom", "Blender", "Docker Desktop",
  "Netflix", "Snipping Tool", "Task Manager", "Clock", "Camera",
];

function letterIcon(name: string) {
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360},80%,45%)"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><text x="64" y="84" font-size="56" font-family="Segoe UI" font-weight="600" text-anchor="middle" fill="white">${name[0]}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export function mock(cmd: string): unknown {
  switch (cmd) {
    case "list_apps":
      return SAMPLE_APPS.map((name) => ({ id: name, name, target: null, icon: letterIcon(name) }));
    case "battery":
      return { percent: 76, charging: false };
    case "sys_stats":
      return {
        cpu: 10 + Math.random() * 30,
        memUsed: 9e9,
        memTotal: 16e9,
        diskUsed: 310e9,
        diskTotal: 512e9,
        netRx: Math.random() * 2e5,
        netTx: Math.random() * 5e4,
      };
    case "phone_info":
      return { name: "Yusuf's Phone", wallpaper: null, frame: null, status: [{ icon: null, alt: null, text: "Connected · 48%" }] };
    case "power_info":
      return { updates: true };
    case "media_info":
      return { title: "Midnight City", artist: "M83", playing: true, thumb: null };
    default:
      return null;
  }
}
