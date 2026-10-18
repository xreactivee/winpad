export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

let sequence = 0;
export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${(sequence++).toString(36)}`;

export const fold = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i");

export const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(bytes < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
