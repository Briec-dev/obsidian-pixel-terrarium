import { clamp } from "../shared/math";
import {
  MAX_TREE_DECORATIONS,
  MAX_TREE_LANTERNS,
  type DecorationType,
  type PlacedDecoration,
  type TimeOfDay,
} from "../types";

export function hitTestDecoration(
  decorations: PlacedDecoration[],
  width: number,
  height: number,
  x: number,
  y: number,
): PlacedDecoration | null {
  for (let i = decorations.length - 1; i >= 0; i--) {
    const d = decorations[i];
    const dx = d.normX * width;
    const dy = d.normY * height;
    if (Math.hypot(x - dx, y - dy) <= 16) {
      return d;
    }
  }
  return null;
}

/**
 * Adds a placed decoration while enforcing per-type lantern cap (`MAX_TREE_LANTERNS`)
 * and global decoration cap (`MAX_TREE_DECORATIONS`).
 */
export function placeDecorationWithCaps(
  decorations: readonly PlacedDecoration[],
  newDeco: PlacedDecoration,
): PlacedDecoration[] {
  const next = [...decorations];
  if (newDeco.type === "lantern") {
    let lanternCount = 0;
    for (const d of next) {
      if (d.type === "lantern") lanternCount++;
    }
    if (lanternCount >= MAX_TREE_LANTERNS) {
      const oldestLanternIdx = next.findIndex((d) => d.type === "lantern");
      if (oldestLanternIdx >= 0) next.splice(oldestLanternIdx, 1);
    }
  }
  if (next.length >= MAX_TREE_DECORATIONS) {
    const oldestSameIdx = next.findIndex((d) => d.type === newDeco.type);
    next.splice(oldestSameIdx >= 0 ? oldestSameIdx : 0, 1);
  }
  next.push(newDeco);
  return next;
}

interface LanternGlowSpan {
  dx: number;
  dy: number;
  len: number;
  fill: string;
}

const LANTERN_PIXEL_GLOW_SPAN_CACHE = new Map<string, readonly LanternGlowSpan[]>();

export function getLanternPixelGlowSpans(
  glowRadius: number,
  isDark: boolean,
  isLightTheme: boolean,
  flickerStep: number,
): readonly LanternGlowSpan[] {
  const key = `${glowRadius}|${isDark ? 1 : 0}|${isLightTheme ? 1 : 0}|${flickerStep}`;
  const cached = LANTERN_PIXEL_GLOW_SPAN_CACHE.get(key);
  if (cached) return cached;

  const flicker = 0.7 + (flickerStep / 8) * 0.3;
  const spans: LanternGlowSpan[] = [];
  for (let dy = -glowRadius; dy <= glowRadius; dy++) {
    let curFill = "";
    let spanStart = 0;
    let spanLen = 0;

    for (let dx = -glowRadius; dx <= glowRadius; dx++) {
      const dist = Math.hypot(dx, dy);
      let fill = "";
      if (dist <= glowRadius && !(dist > glowRadius - 1.5 && (dx + dy) % 2 !== 0)) {
        const falloff = 1 - dist / glowRadius;
        const rawAlpha =
          falloff *
          falloff *
          (isDark ? 0.55 : 0.35) *
          (isLightTheme ? 1.2 : 1) *
          flicker;
        const alpha = Math.round(rawAlpha * 20) / 20;
        if (alpha > 0) {
          fill = isLightTheme
            ? dist < 2.2
              ? `rgba(242, 175, 45, ${alpha})`
              : `rgba(220, 128, 25, ${alpha})`
            : dist < 2.2
              ? `rgba(255, 244, 185, ${alpha})`
              : `rgba(255, 185, 70, ${alpha})`;
        }
      }

      if (fill !== "") {
        if (spanLen > 0 && fill === curFill) {
          spanLen++;
        } else {
          if (spanLen > 0) {
            spans.push({ dx: spanStart, dy, len: spanLen, fill: curFill });
          }
          curFill = fill;
          spanStart = dx;
          spanLen = 1;
        }
      } else if (spanLen > 0) {
        spans.push({ dx: spanStart, dy, len: spanLen, fill: curFill });
        spanLen = 0;
        curFill = "";
      }
    }
    if (spanLen > 0) {
      spans.push({ dx: spanStart, dy, len: spanLen, fill: curFill });
    }
  }
  spans.sort((a, b) => (a.fill < b.fill ? -1 : a.fill > b.fill ? 1 : 0));
  LANTERN_PIXEL_GLOW_SPAN_CACHE.set(key, spans);
  return spans;
}

function buildLanternRadialGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseRadius: number,
  peakAlpha: number,
  isLightTheme: boolean,
): CanvasGradient {
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseRadius);
  if (isLightTheme) {
    grad.addColorStop(0, `rgba(240, 175, 45, ${peakAlpha})`);
    grad.addColorStop(0.38, `rgba(225, 138, 28, ${peakAlpha * 0.55})`);
    grad.addColorStop(0.72, `rgba(205, 105, 20, ${peakAlpha * 0.18})`);
    grad.addColorStop(1, "rgba(205, 105, 20, 0)");
  } else {
    grad.addColorStop(0, `rgba(255, 232, 150, ${peakAlpha})`);
    grad.addColorStop(0.38, `rgba(255, 185, 75, ${peakAlpha * 0.55})`);
    grad.addColorStop(0.72, `rgba(255, 140, 40, ${peakAlpha * 0.18})`);
    grad.addColorStop(1, "rgba(255, 140, 40, 0)");
  }
  return grad;
}

export class LanternGlowCache {
  private ambientCache = new Map<string, HTMLCanvasElement>();
  private pixelCache = new Map<string, HTMLCanvasElement>();

  getAmbientCanvas(isDark: boolean, isLightTheme: boolean): HTMLCanvasElement | null {
    if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
      return null;
    }
    const key = `${isDark ? 1 : 0}|${isLightTheme ? 1 : 0}`;
    const existing = this.ambientCache.get(key);
    if (existing) return existing;

    const baseRadius = isDark ? 48 : 30;
    const size = Math.ceil(baseRadius * 2) + 2;
    const half = size / 2;
    const peakAlpha = (isDark ? 0.34 : 0.2) * (isLightTheme ? 1.25 : 1);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const gctx = canvas.getContext("2d");
    if (!gctx) return null;

    gctx.fillStyle = buildLanternRadialGradient(gctx, half, half, baseRadius, peakAlpha, isLightTheme);
    gctx.fillRect(0, 0, size, size);

    this.ambientCache.set(key, canvas);
    return canvas;
  }

  getPixelGlowCanvas(
    glowRadius: number,
    isDark: boolean,
    isLightTheme: boolean,
    flickerStep: number,
  ): HTMLCanvasElement | null {
    if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
      return null;
    }
    const key = `${glowRadius}|${isDark ? 1 : 0}|${isLightTheme ? 1 : 0}|${flickerStep}`;
    const existing = this.pixelCache.get(key);
    if (existing) return existing;

    const size = glowRadius * 2 + 1;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const gctx = canvas.getContext("2d");
    if (!gctx) return null;

    const spans = getLanternPixelGlowSpans(glowRadius, isDark, isLightTheme, flickerStep);
    let lastFill = "";
    for (let i = 0; i < spans.length; i++) {
      const sp = spans[i];
      if (sp.fill !== lastFill) {
        gctx.fillStyle = sp.fill;
        lastFill = sp.fill;
      }
      gctx.fillRect(glowRadius + sp.dx, glowRadius + sp.dy, sp.len, 1);
    }

    if (this.pixelCache.size >= 64) {
      this.pixelCache.clear();
    }
    this.pixelCache.set(key, canvas);
    return canvas;
  }
}

export function drawLanternAmbientGlow(
  ctx: CanvasRenderingContext2D,
  cache: LanternGlowCache,
  windTime: number,
  lx: number,
  ly: number,
  timeOfDay: TimeOfDay,
  isLightTheme: boolean,
  isGhost: boolean,
): void {
  const flicker =
    0.92 +
    0.08 *
      Math.sin(windTime * 7.3 + lx * 0.13) *
      Math.cos(windTime * 4.1 + ly * 0.09);
  const isDark = timeOfDay === "night" || timeOfDay === "dusk";
  const glowCanvas = cache.getAmbientCanvas(isDark, isLightTheme);

  if (glowCanvas) {
    const baseRadius = isDark ? 48 : 30;
    const drawRadius = (baseRadius + 1) * flicker;
    ctx.save();
    ctx.globalCompositeOperation = isLightTheme ? "source-over" : "screen";
    ctx.globalAlpha = flicker * (isGhost ? 0.6 : 1);
    ctx.drawImage(
      glowCanvas,
      lx - drawRadius,
      ly - drawRadius,
      drawRadius * 2,
      drawRadius * 2,
    );
    ctx.restore();
    return;
  }

  const baseRadius = (isDark ? 48 : 30) * flicker;
  const peakAlpha =
    (isDark ? 0.34 : 0.2) *
    (isLightTheme ? 1.25 : 1) *
    (isGhost ? 0.6 : 1);

  ctx.save();
  ctx.globalCompositeOperation = isLightTheme ? "source-over" : "screen";
  ctx.fillStyle = buildLanternRadialGradient(ctx, lx, ly, baseRadius, peakAlpha, isLightTheme);
  ctx.beginPath();
  ctx.arc(lx, ly, baseRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPixelDecoration(
  pctx: CanvasRenderingContext2D,
  cache: LanternGlowCache,
  type: DecorationType,
  ax: number,
  ay: number,
  pw: number,
  ph: number,
  timeOfDay: TimeOfDay,
  windTime: number,
  windStrength: number,
  snowCover: number,
  isLightTheme: boolean,
  isGhost: boolean,
): void {
  pctx.save();
  if (isGhost) {
    pctx.globalAlpha = 0.65;
  }
  if (type === "lantern") {
    const sway = isGhost ? 0 : Math.round(Math.sin(windTime * 2.1 + ax * 0.3) * 0.6 * windStrength);
    const isDark = timeOfDay === "night" || timeOfDay === "dusk";
    const flicker = 0.85 + 0.15 * Math.sin(windTime * 8.5 + ax);
    const flickerStep = clamp(Math.round(((flicker - 0.7) / 0.3) * 8), 0, 8);
    const glowRadius = isDark ? 6 : 4;
    const cx = ax + sway;
    const cy = ay + 1;

    const glowCanvas = cache.getPixelGlowCanvas(glowRadius, isDark, isLightTheme, flickerStep);
    if (glowCanvas) {
      pctx.drawImage(glowCanvas, cx - glowRadius, cy - glowRadius);
    } else {
      const glowSpans = getLanternPixelGlowSpans(glowRadius, isDark, isLightTheme, flickerStep);
      let lastGlowFill = "";
      for (let i = 0; i < glowSpans.length; i++) {
        const sp = glowSpans[i];
        const py = cy + sp.dy;
        if (py < 0 || py >= ph) continue;
        const x0 = Math.max(0, cx + sp.dx);
        const x1 = Math.min(pw, cx + sp.dx + sp.len);
        if (x1 <= x0) continue;
        if (sp.fill !== lastGlowFill) {
          pctx.fillStyle = sp.fill;
          lastGlowFill = sp.fill;
        }
        pctx.fillRect(x0, py, x1 - x0, 1);
      }
    }

    pctx.fillStyle = "#4b382a";
    pctx.fillRect(ax, ay - 3, 1, 2);
    pctx.fillStyle = "#2d2420";
    pctx.fillRect(cx - 1, ay - 1, 3, 1);
    pctx.fillStyle = "#ffb944";
    pctx.fillRect(cx - 1, ay, 3, 2);
    pctx.fillStyle = "#fff7c8";
    pctx.fillRect(cx, ay, 1, 2);
    pctx.fillStyle = "#2d2420";
    pctx.fillRect(cx - 1, ay + 2, 3, 1);
    if (!isGhost && snowCover > 0.35) {
      pctx.fillStyle = "#ffffff";
      pctx.fillRect(cx - 1, ay - 2, 3, 1);
    }
  } else {
    pctx.fillStyle = "#a6754b";
    pctx.fillRect(ax - 2, ay - 1, 4, 3);
    pctx.fillStyle = "#6c462c";
    pctx.fillRect(ax - 2, ay - 2, 4, 1);
    pctx.fillStyle = "#22160f";
    pctx.fillRect(ax, ay, 1, 1);
    if (!isGhost && snowCover > 0.35) {
      pctx.fillStyle = "#ffffff";
      pctx.fillRect(ax - 2, ay - 3, 4, 1);
    }
  }
  pctx.restore();
}
