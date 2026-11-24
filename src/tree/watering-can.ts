import { clamp } from "../shared/math";
import type { TreeSkeleton } from "../types";

export interface WateringCanAnimState {
  active: boolean;
  elapsed: number;
  duration: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  dir: 1 | -1;
}

export function createWateringCanAnim(
  skeleton: TreeSkeleton,
  canvasWidth: number,
): WateringCanAnimState {
  const w = Math.max(120, canvasWidth);
  const targetX = skeleton.trunkBaseX;
  const targetY = clamp(
    skeleton.boundingBox.minY + (skeleton.groundY - skeleton.boundingBox.minY) * 0.45,
    24,
    Math.max(24, skeleton.groundY - 4),
  );
  const dir: 1 | -1 = targetX >= w * 0.5 ? 1 : -1;
  const x = clamp(targetX - dir * 28, 22, Math.max(22, w - 22));
  const y = Math.max(18, skeleton.boundingBox.minY - 18);

  return {
    active: true,
    elapsed: 0,
    duration: 2.0,
    x,
    y,
    targetX,
    targetY,
    dir,
  };
}

export interface WateringCanStepCallbacks {
  spawnWaterDrop: (x: number, y: number, vx: number, vy: number, color: string) => void;
  spawnSplash: (x: number, y: number) => void;
  onPourShake: (dt: number) => void;
}

export function stepWateringCanAnim(
  anim: WateringCanAnimState,
  dt: number,
  skeleton: TreeSkeleton,
  dropAccum: number,
  callbacks: WateringCanStepCallbacks,
): { active: boolean; dropAccum: number } {
  anim.elapsed += dt;
  if (anim.elapsed >= anim.duration) {
    return { active: false, dropAccum };
  }

  let nextAccum = dropAccum;
  const t = anim.elapsed / anim.duration;
  if (t >= 0.16 && t <= 0.8) {
    const spoutX = anim.x + anim.dir * 12;
    const spoutY = anim.y + 4;
    nextAccum += dt * 36;
    while (nextAccum >= 1) {
      nextAccum -= 1;
      callbacks.spawnWaterDrop(
        spoutX + (Math.random() - 0.5) * 3,
        spoutY + (Math.random() - 0.5) * 2,
        anim.dir * (24 + Math.random() * 14),
        16 + Math.random() * 16,
        Math.random() < 0.35 ? "#a8dcff" : "#6bc4ff",
      );
    }
    if (Math.random() < dt * 10) {
      const splashX = anim.targetX + (Math.random() - 0.5) * 18;
      const splashY = Math.min(skeleton.groundY - 2, anim.targetY + Math.random() * 16);
      callbacks.spawnSplash(splashX, splashY);
    }
    callbacks.onPourShake(dt);
  }

  return { active: true, dropAccum: nextAccum };
}

export function renderWateringCan(
  pctx: CanvasRenderingContext2D,
  anim: WateringCanAnimState,
  pixelScale: number,
  pw: number,
  ph: number,
  isLightTheme: boolean,
): void {
  const t = clamp(anim.elapsed / anim.duration, 0, 1);
  const fadeAlpha = t < 0.12 ? t / 0.12 : t > 0.84 ? (1 - t) / 0.16 : 1;
  const tilted = t >= 0.16 && t <= 0.82;
  const dir = anim.dir;

  const cx = clamp(Math.round(anim.x / pixelScale), 5, Math.max(5, pw - 6));
  const bobY = tilted ? Math.round(Math.sin(anim.elapsed * 7) * 0.6) : 0;
  const cy = clamp(Math.round(anim.y / pixelScale) + bobY, 4, Math.max(4, ph - 8));

  const bodyDark = "#2d5f7e";
  const bodyMid = "#498db5";
  const bodyLight = "#83c5eb";
  const roseColor = "#d6eefc";

  pctx.save();
  pctx.globalAlpha = clamp(fadeAlpha, 0, 1);

  if (tilted) {
    // Tilted pouring body
    pctx.fillStyle = bodyDark;
    pctx.fillRect(cx - 2, cy - 1, 4, 3);
    pctx.fillStyle = bodyMid;
    pctx.fillRect(cx - 2, cy - 1, 3, 2);
    pctx.fillStyle = bodyLight;
    pctx.fillRect(cx - 1, cy - 1, 2, 1);

    // Handle tilted up on back
    pctx.fillStyle = bodyDark;
    pctx.fillRect(cx - dir * 3, cy - 2, 1, 2);
    pctx.fillRect(cx - dir * 2, cy - 2, 2, 1);

    // Spout angled downward toward tree
    pctx.fillStyle = bodyMid;
    pctx.fillRect(cx + dir * 2, cy, 2, 1);
    pctx.fillRect(cx + dir * 3, cy + 1, 2, 1);
    pctx.fillStyle = roseColor;
    pctx.fillRect(cx + dir * 4, cy + 1, 1, 2);

    // Curved pouring water stream in pixel grid
    const streamColorA = isLightTheme ? "#2782db" : "#6bc4ff";
    const streamColorB = isLightTheme ? "#60a5fa" : "#b8e6ff";
    const phase = Math.floor(anim.elapsed * 16);
    const sx0 = cx + dir * 5;
    const sy0 = cy + 2;
    for (let k = 0; k < 5; k++) {
      const px = sx0 + dir * k;
      const py = sy0 + Math.floor((k * k + k) * 0.35);
      if (px < 0 || px >= pw || py < 0 || py >= ph) continue;
      pctx.fillStyle = (k + phase) % 2 === 0 ? streamColorA : streamColorB;
      pctx.fillRect(px, py, 1, 1);
    }
  } else {
    // Upright body
    pctx.fillStyle = bodyDark;
    pctx.fillRect(cx - 2, cy - 1, 4, 3);
    pctx.fillStyle = bodyMid;
    pctx.fillRect(cx - 2, cy - 1, 4, 2);
    pctx.fillStyle = bodyLight;
    pctx.fillRect(cx - 1, cy - 1, 2, 1);

    // Top & side handle
    pctx.fillStyle = bodyDark;
    pctx.fillRect(cx - dir * 3, cy - 1, 1, 2);
    pctx.fillRect(cx - 1, cy - 2, 2, 1);

    // Upright spout angled slightly up
    pctx.fillStyle = bodyMid;
    pctx.fillRect(cx + dir * 2, cy, 2, 1);
    pctx.fillRect(cx + dir * 3, cy - 1, 1, 1);
    pctx.fillStyle = roseColor;
    pctx.fillRect(cx + dir * 4, cy - 1, 1, 1);
  }

  pctx.restore();
}
