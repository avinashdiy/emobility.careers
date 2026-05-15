"use client";

import { useEffect, useRef } from "react";

/**
 * Zero-dep confetti burst. Mounts a fullscreen canvas, fires a single
 * burst of ~70 brand-coloured particles, then auto-cleans up after
 * ~1.6s. No npm dep — keeps the build lean and lets us tune the look
 * to the EV brand directly.
 *
 * Use as a one-shot component the page conditionally renders the
 * FIRST time a delight-worthy event occurs (first application sent,
 * profile crossed 80% complete, DIYguru badge granted, first job
 * posted, first hire moved through the pipeline).
 *
 * Caller controls "when" by controlling whether this component
 * renders — once rendered it fires immediately and removes itself.
 */
const BRAND = ["#8fd299", "#c1ffb4", "#3d5e58", "#e8833a", "#fff8e1"];

interface ConfettiProps {
  /// Origin in viewport coords (0..1). Default mid-screen, slightly above
  /// centre — that's where the eye naturally lands so it feels deliberate.
  origin?: { x: number; y: number };
  /// Fires after the last particle settles. Caller can flip state so the
  /// component un-mounts and the burst doesn't re-fire on next render.
  onComplete?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vrot: number;
  shape: "rect" | "circle";
}

export function Confetti({ origin = { x: 0.5, y: 0.4 }, onComplete }: ConfettiProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Reduced-motion: skip the burst — the semantic moment comes from
    // the toast / state change, not the confetti itself.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onComplete?.();
      return;
    }
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const ox = origin.x * window.innerWidth;
    const oy = origin.y * window.innerHeight;
    const particles: Particle[] = [];
    // 70 particles is the sweet spot — fewer feels stingy, more reads as
    // chaos. The spread is biased upward (gravity does the rest) so the
    // burst looks like a fountain rather than a starburst.
    for (let i = 0; i < 70; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = 8 + Math.random() * 8;
      particles.push({
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 6,
        color: BRAND[Math.floor(Math.random() * BRAND.length)],
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.4,
        shape: Math.random() > 0.5 ? "rect" : "circle",
      });
    }

    const start = performance.now();
    const lifeMs = 1600;
    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const tFade = Math.max(0, Math.min(1, (elapsed - 900) / (lifeMs - 900)));
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      for (const p of particles) {
        // Light gravity + drag so the arc looks natural.
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = 1 - tFade;
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (elapsed < lifeMs) {
        rafId = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
    />
  );
}
