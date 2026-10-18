import { useEffect, useState } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";
import { emit, inTauri, listen, windowLabel } from "./api";

type Change = { key: string; value: unknown; from: string };

const FILE = "winpad.json";
let storePromise: Promise<Store> | null = null;
const store = () => (storePromise ??= load(FILE, { autoSave: 200, defaults: {} }));

const cache = new Map<string, unknown>();
const subscribers = new Map<string, Set<(value: unknown) => void>>();
const savers = new Map<string, (value: unknown) => unknown>();

function notify(key: string, value: unknown) {
  cache.set(key, value);
  subscribers.get(key)?.forEach((fn) => fn(value));
}

listen<Change>("state-changed", (change) => {
  if (change.from !== windowLabel) notify(change.key, change.value);
});

const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export function onSave(key: string, fn: (value: unknown) => unknown) {
  savers.set(key, fn);
}

export async function getStored<T>(key: string, fallback: T): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  let value: T | undefined;
  if (inTauri) value = (await (await store()).get<T>(key)) ?? undefined;
  else {
    const raw = localStorage.getItem("winpad:" + key);
    value = raw ? (JSON.parse(raw) as T) : undefined;
  }
  if (cache.has(key)) return cache.get(key) as T;
  const merged = value === undefined ? fallback : isRecord(value) && isRecord(fallback) ? ({ ...fallback, ...value } as T) : value;
  cache.set(key, merged);
  return merged;
}

export async function setStored<T>(key: string, value: T) {
  notify(key, value);
  if (inTauri) await (await store()).set(key, value);
  else localStorage.setItem("winpad:" + key, JSON.stringify(value));
  await emit("state-changed", { key, value, from: windowLabel } satisfies Change);
  await savers.get(key)?.(value);
}

export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => (cache.has(key) ? (cache.get(key) as T) : fallback));
  const [ready, setReady] = useState(cache.has(key));
  const [initial] = useState(fallback);
  useEffect(() => {
    let alive = true;
    const fn = (v: unknown) => alive && setValue(v as T);
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key)!.add(fn);
    void getStored(key, initial).then((v) => {
      if (!alive) return;
      setValue(v);
      setReady(true);
    });
    return () => {
      alive = false;
      subscribers.get(key)!.delete(fn);
    };
  }, [key, initial]);
  const update = (next: T | ((prev: T) => T)) => {
    const prev = (cache.has(key) ? cache.get(key) : value) as T;
    void setStored(key, typeof next === "function" ? (next as (p: T) => T)(prev) : next);
  };
  return [value, update, ready] as const;
}
