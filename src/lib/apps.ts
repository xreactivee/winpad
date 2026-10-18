import { useEffect, useState } from "react";
import { api, type App } from "./api";
import { getStored, setStored, useStored } from "./store";

let cached: App[] | null = null;
let pending: Promise<App[]> | null = null;
const subscribers = new Set<(apps: App[]) => void>();

export function refreshApps() {
  pending = api.listApps().then((apps) => {
    cached = apps;
    subscribers.forEach((fn) => fn(apps));
    return apps;
  });
  return pending;
}

export function useApps() {
  const [apps, setApps] = useState<App[]>(cached ?? []);
  useEffect(() => {
    subscribers.add(setApps);
    if (!cached) void (pending ?? refreshApps());
    return () => void subscribers.delete(setApps);
  }, []);
  return apps;
}

export const useHistory = () => useStored<string[]>("history", []);

export async function openApp(id: string) {
  await api.launchApp(id);
  const history = await getStored<string[]>("history", []);
  await setStored("history", [id, ...history.filter((x) => x !== id)].slice(0, 12));
}
