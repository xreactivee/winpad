const SAMPLE_APPS = [
  "App Store", "Calculator", "Calendar", "ChatGPT", "Chrome", "Discord", "Edge", "Excel", "Figma",
  "File Explorer", "GitHub Desktop", "Mail", "Maps", "Notepad", "Notion", "OBS Studio", "Obsidian",
  "Outlook", "Paint", "Photos", "PowerPoint", "Settings", "Slack", "Spotify", "Steam", "Telegram",
  "Terminal", "Visual Studio Code", "VLC", "WhatsApp", "Word", "Xbox", "Zoom", "Blender", "Docker Desktop",
  "Netflix", "Snipping Tool", "Task Manager", "Clock", "Camera",
];

const SAMPLE_FILES = ["Documents", "Downloads", "Budget 2026.xlsx", "Project Notes.docx", "Screenshot 2026-10-24.png", "Invoice.pdf", "Travel"];

function letterIcon(name: string) {
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360},80%,45%)"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><text x="64" y="84" font-size="56" font-family="Segoe UI" font-weight="600" text-anchor="middle" fill="white">${name[0]}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

const state = { wifi: true, bluetooth: false, dark: true, awake: false, volume: 0.6, muted: false, layout: 1, saver: false, brightness: 70, network: "TURKNET_AFECB" };

const two = (n: number) => String(n).padStart(2, "0");
const icsTime = (d: Date) => `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}T${two(d.getHours())}${two(d.getMinutes())}00`;

function sampleCalendar() {
  const at = (minutes: number) => new Date(Math.ceil(Date.now() / 300_000) * 300_000 + minutes * 60_000);
  const event = (uid: string, title: string, start: Date, minutes: number, extra: string[] = []) => [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${title}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(new Date(start.getTime() + minutes * 60_000))}`,
    ...extra,
    "END:VEVENT",
  ];
  return [
    "BEGIN:VCALENDAR",
    ...event("standup", "Standup", at(25), 15, ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]),
    ...event("review", "Design review", at(26 * 60), 60, ["LOCATION:Room 4"]),
    ...event("lunch", "Lunch with Sam", at(3 * 24 * 60), 60),
    "END:VCALENDAR",
  ].join("\r\n");
}

function sampleScreenTime() {
  return [6, 5, 4, 3, 2, 1, 0].map((offset) => {
    const d = new Date(Date.now() - offset * 86_400_000);
    const apps = { "Visual Studio Code": 9200 - offset * 600, Chrome: 7400 + offset * 300, Slack: 2600, Spotify: 1800 - offset * 100, Figma: 1500 };
    const total = Object.values(apps).reduce((a, b) => a + b, 0);
    const hours = Array.from({ length: 24 }, (_, h) => (h >= 9 && h <= 19 ? Math.round(total / 11) : 0));
    return { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, total, hours, apps };
  });
}

const sampleWindow = (hwnd: number, title: string, appId: string, active = false, minimized = false) => ({
  hwnd,
  title,
  exe: `C:\\Program Files\\${appId}\\${appId}.exe`,
  appId,
  icon: null,
  active,
  minimized,
});

export function mock(cmd: string, args?: Record<string, unknown>): unknown {
  switch (cmd) {
    case "list_apps":
      return SAMPLE_APPS.map((name) => ({ id: name, name, target: null, icon: letterIcon(name) }));
    case "search_files": {
      const q = String(args?.query ?? "").toLowerCase();
      return SAMPLE_FILES.filter((name) => name.toLowerCase().split(/[\s.-]+/).some((w) => w.startsWith(q))).map((name) => ({
        name,
        path: `C:\\Users\\Alex\\${name}`,
        folder: !name.includes("."),
        icon: null,
      }));
    }
    case "account_info":
      return { name: "Alex Morgan", email: "alex@example.com", picture: null };
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
    case "list_windows":
      return [
        sampleWindow(11, "winpad - Visual Studio Code", "Visual Studio Code", true),
        sampleWindow(12, "Inbox - Chrome", "Chrome"),
        sampleWindow(13, "Docs - Chrome", "Chrome", false, true),
        sampleWindow(14, "Spotify Premium", "Spotify"),
      ];
    case "taskbar_pins":
      return ["File Explorer", "Chrome", "Visual Studio Code", "Terminal"];
    case "volume":
      return { level: state.volume, muted: state.muted };
    case "set_volume":
      if (typeof args?.level === "number") state.volume = args.level;
      if (typeof args?.muted === "boolean") state.muted = args.muted;
      return null;
    case "radios":
      return [
        { kind: "wifi", on: state.wifi },
        { kind: "bluetooth", on: state.bluetooth },
      ];
    case "set_radio":
      state[args?.kind === "wifi" ? "wifi" : "bluetooth"] = Boolean(args?.on);
      return null;
    case "theme":
      return state.dark;
    case "set_theme":
      state.dark = Boolean(args?.dark);
      return null;
    case "keep_awake":
      return state.awake;
    case "set_keep_awake":
      return (state.awake = Boolean(args?.on));
    case "keyboard_layouts":
      return {
        current: state.layout,
        list: [
          { id: 1, code: "TR", name: "Turkish (Turkey)" },
          { id: 2, code: "EN", name: "English (United States)" },
        ],
      };
    case "set_keyboard_layout":
      state.layout = Number(args?.id);
      return null;
    case "recent_files": {
      const names = args?.folder === "screenshots" ? ["Screenshot 2026-10-24 101512.png", "Screenshot 2026-10-23 184401.png"] : ["Invoice.pdf", "winpad-setup.exe"];
      return names.map((name, i) => ({ name, path: `C:\\Users\\Alex\\${name}`, icon: null, modified: Date.now() - i * 3_600_000 }));
    }
    case "recycle_bin":
      return { items: 12, bytes: 48e6 };
    case "screen_time":
      return sampleScreenTime();
    case "ai_usage":
      return {
        claude: { sessionTokens: 1_284_000, sessionResetsAt: Date.now() + 2.6 * 3_600_000, weekTokens: 18_400_000, topModel: "claude-opus-5-5" },
        codex: {
          primary: { percent: 92, minutes: 300, resetsAt: Date.now() + 9_600_000 },
          secondary: { percent: 41, minutes: 10080, resetsAt: Date.now() + 3 * 86_400_000 },
          at: Date.now(),
        },
      };
    case "fetch_calendar":
      return sampleCalendar();
    case "quick_info":
      return { airplane: !state.wifi && !state.bluetooth, batterySaver: state.saver, ssid: state.wifi && state.network ? state.network : null };
    case "set_airplane_mode":
      state.wifi = state.bluetooth = !args?.on;
      return null;
    case "set_battery_saver":
      state.saver = Boolean(args?.on);
      return null;
    case "wifi_networks":
      return state.wifi
        ? [
            { ssid: "TURKNET_AFECB", bars: 4, secure: true },
            { ssid: "Cafe Guest", bars: 3, secure: false },
            { ssid: "VODAFONE_2728", bars: 2, secure: true },
          ].map((n) => ({ ...n, connected: n.ssid === state.network }))
        : [];
    case "wifi_connect":
      if (args?.ssid === "VODAFONE_2728") return false;
      state.network = String(args?.ssid);
      return true;
    case "wifi_disconnect":
      state.network = "";
      return null;
    case "bluetooth_devices":
      return [
        { name: "Lenovo WL310", connected: true },
        { name: "SOFFANY AP-05", connected: false },
      ];
    case "brightness":
      return state.brightness;
    case "set_brightness":
      state.brightness = Number(args?.level);
      return null;
    case "notifications":
      return {
        allowed: true,
        items: [
          { id: 1, app: "Snipping Tool", appId: "Snipping Tool", title: "Screenshot copied", body: "Saved to the Screenshots folder", icon: null, at: Date.now() - 60_000 },
          { id: 2, app: "Claude", appId: "Claude", title: "Taskbar customization", body: "dock/taskbar changes done", icon: null, at: Date.now() - 3_600_000 },
          { id: 3, app: "Instagram", appId: null, title: "yuruyen_istanbul", body: "x.reactive_ via Phone Link", icon: null, at: Date.now() - 7_200_000 },
        ],
      };
    case "dismiss_notification":
      return null;
    default:
      return null;
  }
}
