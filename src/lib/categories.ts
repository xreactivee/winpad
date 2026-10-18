import type { App } from "./api";
import { byId, fold } from "./util";

export type CategoryKey =
  | "productivity"
  | "utilities"
  | "graphics"
  | "developer"
  | "reading"
  | "music"
  | "entertainment"
  | "social"
  | "photo"
  | "other";

export type Group = { key: string; name: string; apps: App[] };

export const CATEGORIES: { key: CategoryKey; name: string }[] = [
  { key: "productivity", name: "Productivity" },
  { key: "utilities", name: "Utilities" },
  { key: "graphics", name: "Graphics & Design" },
  { key: "developer", name: "Developer Tools" },
  { key: "reading", name: "Information & Reading" },
  { key: "music", name: "Music" },
  { key: "entertainment", name: "Entertainment" },
  { key: "social", name: "Social" },
  { key: "photo", name: "Photo & Video" },
  { key: "other", name: "Other" },
];

const RULES: [CategoryKey, string[]][] = [
  ["developer", ["visual studio", "vs code", "code", "terminal", "powershell", "command prompt", "komut istemi", "git", "python", "node", "docker", "postman", "jetbrains", "intellij", "pycharm", "webstorm", "rider", "android studio", "cursor", "sublime", "notepad++", "wsl", "ubuntu", "putty", "winscp", "dbeaver", "insomnia", "claude", "unity", "unreal"]],
  ["music", ["spotify", "music", "müzik", "itunes", "winamp", "tidal", "deezer", "foobar", "audacity", "fl studio", "ableton", "soundcloud"]],
  ["social", ["discord", "whatsapp", "telegram", "teams", "slack", "zoom", "skype", "signal", "messenger", "instagram", "facebook", "twitter", "x.com", "phone link", "telefon bağlantısı", "linkedin"]],
  ["graphics", ["photoshop", "illustrator", "figma", "blender", "gimp", "krita", "paint", "affinity", "canva", "inkscape", "sketch", "lightroom", "indesign", "after effects", "cinema 4d", "autocad", "fusion", "3d"]],
  ["photo", ["premiere", "davinci", "vlc", "obs", "capcut", "photos", "fotoğraflar", "camera", "kamera", "clipchamp", "media player", "medya oynatıcı", "movies", "filmler", "handbrake", "mpc", "potplayer", "kdenlive", "shotcut"]],
  ["productivity", ["word", "excel", "powerpoint", "outlook", "onenote", "notion", "obsidian", "calendar", "takvim", "mail", "posta", "to do", "todo", "evernote", "acrobat", "notepad", "not defteri", "libreoffice", "office", "access", "publisher", "chatgpt", "copilot", "todoist", "trello", "sticky notes", "yapışkan notlar"]],
  ["reading", ["chrome", "edge", "firefox", "opera", "brave", "vivaldi", "safari", "news", "haberler", "kindle", "reader", "weather", "hava durumu", "maps", "haritalar", "dictionary", "sözlük", "wikipedia", "books"]],
  ["entertainment", ["steam", "epic games", "xbox", "netflix", "prime video", "disney", "game", "oyun", "riot", "valorant", "league of legends", "battle.net", "ea app", "ubisoft", "gog", "minecraft", "roblox", "twitch", "youtube", "spotify podcasts", "solitaire"]],
  ["utilities", ["settings", "ayarlar", "control panel", "denetim masası", "task manager", "görev yöneticisi", "calculator", "hesap makinesi", "snipping", "ekran alıntısı", "7-zip", "winrar", "powertoys", "cleanup", "temizleme", "defrag", "explorer", "dosya gezgini", "clock", "saat", "store", "mağaza", "registry", "kayıt defteri", "disk", "remote desktop", "uzak masaüstü", "security", "güvenlik", "defender", "everything", "bitwarden", "1password", "keepass", "vpn", "nvidia", "amd", "intel", "logitech", "razer", "corsair", "msi", "asus", "backup", "recorder", "kaydedici", "magnifier", "büyüteç", "character map", "run", "çalıştır", "app installer"]],
];

const NORMALIZED = RULES.map(([key, words]) => [key, words.map(fold)] as const);

function hit(name: string, word: string) {
  if (word.length > 4) return name.includes(word);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.+]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(name);
}

export function categorize(name: string, overrides: Record<string, string> = {}, id = name): CategoryKey {
  const forced = overrides[id] as CategoryKey | undefined;
  if (forced && CATEGORIES.some((c) => c.key === forced)) return forced;
  const folded = fold(name);
  for (const [key, words] of NORMALIZED) if (words.some((w) => hit(folded, w))) return key;
  return "other";
}

export function categoryName(key: string) {
  return CATEGORIES.find((c) => c.key === key)?.name ?? "Folder";
}

export function libraryGroups(apps: App[], history: string[], hidden: string[], overrides: Record<string, string>): Group[] {
  const map = byId(apps);
  const hiddenSet = new Set(hidden);
  const groups: Group[] = [];
  const recent = history.map((id) => map.get(id)).filter((a): a is App => !!a && !hiddenSet.has(a.id));
  if (recent.length) groups.push({ key: "recent", name: "Recently Opened", apps: recent });
  const visible = apps.filter((a) => !hiddenSet.has(a.id));
  for (const c of CATEGORIES) {
    const list = visible.filter((a) => categorize(a.name, overrides, a.id) === c.key);
    if (list.length) groups.push({ key: c.key, name: c.name, apps: list });
  }
  groups.push({ key: "hidden", name: "Hidden", apps: hidden.map((id) => map.get(id)).filter((a): a is App => !!a) });
  return groups;
}
