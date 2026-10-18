import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react";
import { ThinkingOrb, resolvePreset, type OrbState } from "thinking-orbs";
import { clamp } from "../lib/util";
import { BASE, type WidgetProps } from "./shared";

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

function ParticleSphere({ size, color = "#ffffff", speed = 1, interactive = false }: { size: number; color?: string; speed?: number; interactive?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const n = Math.round(Math.min(800, 200 + size * 2.5));
    const BUCKETS = 8;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pts = Array.from({ length: n }, (_, i) => {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      return { x: Math.cos(golden * i) * r, y, z: Math.sin(golden * i) * r, ph: Math.random() * Math.PI * 2 };
    });
    const [cr, cg, cb] = hexRgb(color);
    let tiltX = 0.35;
    let targetX = 0.35;
    let targetY = 0;
    let extraY = 0;
    let drag: { x: number; y: number } | null = null;
    let yaw = 0;
    let userTilt = 0;
    let vYaw = 0;
    let vTilt = 0;
    const onMove = (e: PointerEvent) => {
      targetX = 0.35 + (e.clientY / innerHeight - 0.5) * 0.5;
      targetY = (e.clientX / innerWidth - 0.5) * 0.8;
      if (!drag) return;
      vYaw = (e.clientX - drag.x) * 0.012;
      vTilt = (e.clientY - drag.y) * 0.012;
      yaw += vYaw;
      userTilt = clamp(userTilt + vTilt, -1.3, 1.3);
      drag = { x: e.clientX, y: e.clientY };
    };
    const onDown = (e: PointerEvent) => {
      if (!interactive || e.button !== 0) return;
      e.stopPropagation();
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY };
      vYaw = vTilt = 0;
    };
    const onUp = () => (drag = null);
    window.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const R = size * 0.42;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const moving = drag || Math.abs(vYaw) > 0.0005 || Math.abs(userTilt) > 0.002;
      if (document.hidden || (!moving && now - last < 33)) return;
      last = now;
      if (!drag) {
        yaw += vYaw;
        vYaw *= 0.95;
        userTilt += vTilt;
        vTilt *= 0.85;
        userTilt *= 0.97;
      }
      const t = ((now - t0) / 1000) * speed;
      tiltX += (targetX - tiltX) * 0.04;
      extraY += (targetY - extraY) * 0.04;
      const ay = t * 0.35 + extraY + yaw;
      const ax = tiltX + userTilt;
      const [sy, cy] = [Math.sin(ay), Math.cos(ay)];
      const [sx, cx] = [Math.sin(ax), Math.cos(ax)];
      ctx.clearRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size / 2, size / 2, R * 0.1, size / 2, size / 2, R * 1.25);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},0.10)`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const paths = Array.from({ length: BUCKETS }, () => new Path2D());
      for (const p of pts) {
        const x1 = p.x * cy - p.z * sy;
        const z1 = p.x * sy + p.z * cy;
        const y2 = p.y * cx - z1 * sx;
        const z2 = p.y * sx + z1 * cx;
        const depth = (z2 + 1) / 2;
        const persp = 1 / (1.9 - z2 * 0.45);
        const shimmer = 0.75 + 0.25 * Math.sin(t * 2.2 + p.ph);
        const px = size / 2 + x1 * R * persp * 1.3;
        const py = size / 2 + y2 * R * persp * 1.3;
        const rad = Math.max(0.3, (0.35 + depth * 1.25) * (size / 160) * shimmer);
        const alpha = (0.12 + depth * 0.88) * shimmer;
        const path = paths[Math.min(BUCKETS - 1, Math.floor(alpha * BUCKETS))];
        path.moveTo(px + rad, py);
        path.arc(px, py, rad, 0, Math.PI * 2);
      }
      paths.forEach((path, b) => {
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${(b + 0.5) / BUCKETS})`;
        ctx.fill(path);
      });
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [size, color, speed, interactive]);
  return <canvas ref={ref} onClick={stop} style={{ width: size, height: size, display: "block", cursor: interactive ? "grab" : undefined, touchAction: "none" }} />;
}

type Live = { mul: number; opts: Record<string, number> };

function OrbToy({ state, color, speed, box, interactive }: { state: OrbState; color?: string; speed: number; box: number; interactive: boolean }) {
  const base = useMemo(() => resolvePreset(state, 64).opts as Record<string, number>, [state]);
  const wrap = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<Live>({ mul: 1, opts: {} });
  const s = useRef({ rx: 0, ry: 0, vx: 0, vy: 0, scale: 1, target: 1, boost: 0, prox: 0, burstUntil: 0, held: false, turns: 0, spin: 0, shape: -1, raf: 0 });
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
  const tilts = state !== "breathing";

  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);

  const step = () => {
    const p = s.current;
    p.raf = 0;
    if (!drag.current) {
      p.rx += p.vx;
      p.ry += p.vy;
      p.vx *= 0.88;
      p.vy *= 0.88;
      p.rx *= 0.9;
      p.ry *= 0.9;
      p.spin *= 0.97;
    }
    p.scale += (p.target - p.scale) * 0.15;
    p.boost *= 0.95;
    const burst = performance.now() < p.burstUntil;
    let mul = 1;
    const opts: Record<string, number> = {};
    switch (state) {
      case "working":
        mul = 1 + p.boost * 5;
        break;
      case "searching":
        mul = 1 + p.boost;
        opts.scanMul = base.scanMul * (1 + p.boost * 2);
        break;
      case "solving":
        mul = burst ? 4 : 1;
        opts.moveCount = burst ? base.moveCount * 2 : base.moveCount;
        break;
      case "listening":
        mul = 1 + p.prox * 1.5 + p.boost * 2;
        break;
      case "connecting":
        opts.thr = base.thr * (1 + p.prox * 0.6);
        opts.signals = burst ? base.signals * 3 : base.signals;
        break;
      case "weaving":
        mul = 1 + p.boost;
        opts.turns = p.turns || base.turns;
        break;
      case "composing":
        opts.wobMul = base.wobMul * (1 + p.boost * 3);
        opts.spin = p.spin;
        break;
      case "breathing":
        mul = p.held ? 0.4 : 1;
        break;
      case "shaping":
        if (p.shape >= 0) opts.shape = p.shape;
        break;
    }
    if (wrap.current) wrap.current.style.transform = `perspective(500px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) scale(${p.scale})`;
    const q = (v: number) => Math.round(v * 20) / 20;
    const next: Live = { mul: q(mul), opts: Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, q(v)])) };
    if (JSON.stringify(next) !== JSON.stringify(liveRef.current)) setLive(next);
    const busy =
      drag.current || burst || Math.abs(p.rx) + Math.abs(p.ry) > 0.05 || Math.abs(p.vx) + Math.abs(p.vy) > 0.01 || Math.abs(p.scale - p.target) > 0.002 || p.boost > 0.01 || Math.abs(p.spin) > 0.01;
    if (busy) p.raf = requestAnimationFrame(step);
  };
  const kick = () => {
    if (!s.current.raf) s.current.raf = requestAnimationFrame(step);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
    const p = s.current;
    p.vx = p.vy = 0;
    if (state === "breathing") {
      p.held = true;
      p.target = 1.28;
    }
    if (state === "listening") p.target = 1.25;
    kick();
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!interactive) return;
    const p = s.current;
    const r = e.currentTarget.getBoundingClientRect();
    p.prox = clamp(1 - Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / r.width, 0, 1);
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      d.x = e.clientX;
      d.y = e.clientY;
      if (tilts) {
        p.vx = -dy * 0.5;
        p.vy = dx * 0.5;
        p.rx = clamp(p.rx + p.vx, -55, 55);
        p.ry = clamp(p.ry + p.vy, -55, 55);
      }
      p.boost = clamp(p.boost + Math.hypot(dx, dy) * 0.012, 0, 1);
      if (state === "weaving") p.turns = clamp((p.turns || base.turns) - dy * 0.03, 1, 8);
      if (state === "composing") p.spin = clamp(p.spin + dx * 0.02, -1.5, 1.5);
    }
    kick();
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    const p = s.current;
    p.held = false;
    p.target = 1;
    if (d && d.moved < 6) {
      if (state === "solving" || state === "connecting") p.burstUntil = performance.now() + 1600;
      if (state === "shaping") p.shape = p.shape >= 2 ? -1 : p.shape + 1;
      if (state === "working" || state === "searching") p.boost = 1;
      if (state === "listening") {
        p.scale = 1.35;
        p.boost = 1;
      }
    }
    kick();
  };
  const onPointerLeave = () => {
    s.current.prox = 0;
    kick();
  };

  const clickOnly = state === "solving" || state === "shaping" || state === "connecting" || state === "listening";
  return (
    <div
      ref={wrap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onClick={stop}
      style={{ width: box, height: box, display: "grid", placeItems: "center", cursor: interactive ? (clickOnly ? "pointer" : "grab") : undefined, touchAction: "none", willChange: "transform" }}
    >
      <div style={{ transform: `scale(${(box * 0.8) / 64})`, pointerEvents: "none" }}>
        <ThinkingOrb state={state} size={64} theme="dark" color={color} speed={speed * live.mul} opts={live.opts} aria-label="Orb" />
      </div>
    </div>
  );
}

export function Orb({ w, editing }: WidgetProps) {
  const base = BASE[w.size];
  const box = Math.min(base.w, base.h);
  const { color, speed } = w.options;
  const interactive = !editing;
  return (
    <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
      {w.style === "sphere" ? (
        <ParticleSphere size={box} color={color} speed={speed} interactive={interactive} />
      ) : (
        <OrbToy state={w.style as OrbState} color={color} speed={speed ?? 1} box={box} interactive={interactive} />
      )}
    </div>
  );
}
