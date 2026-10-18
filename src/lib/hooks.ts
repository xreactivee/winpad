import { useEffect, useRef, useState, type RefObject } from "react";

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function usePoll<T>(fetch: () => Promise<T>, ms: number) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    let last = "";
    const tick = () => {
      if (document.hidden) return;
      fetch()
        .then((v) => {
          const json = JSON.stringify(v);
          if (alive && json !== last) {
            last = json;
            setValue(v);
          }
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fetch, ms]);
  return value;
}

export function useOutsideClick(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [ref]);
}
