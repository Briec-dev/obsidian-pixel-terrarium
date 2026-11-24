import {
  BIRD_FRAMES,
  CLOUD_SPRITES,
  drawSprite,
  MOON_SPRITE,
  SUN_SPRITES,
  type PixelPalette,
} from "../pixel-sprites";
import type { WeatherCondition } from "../types";

export interface CloudEntity {
  x: number;
  y: number;
  vx: number;
  variant: 0 | 1 | 2;
}

export interface StarEntity {
  normX: number;
  normY: number;
  x: number;
  y: number;
  phase: number;
  speed: number;
  colorIndex: number;
}

export interface BirdEntity {
  x: number;
  y: number;
  vx: number;
  flapPhase: number;
}

export interface AmbientMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LightningBolt {
  segments: LightningSegment[];
  age: number;
  maxAge: number;
}

export function getTargetCloudCount(condition: WeatherCondition, mult: number): number {
  let base = 0;
  switch (condition) {
    case "partly-cloudy-day":
    case "partly-cloudy-night":
      base = 3;
      break;
    case "cloudy":
    case "drizzle":
    case "rain":
      base = 5;
      break;
    case "heavy-rain":
    case "thunderstorm":
      base = 6;
      break;
    case "snow":
      base = 4;
      break;
    default:
      base = 0;
      break;
  }
  return Math.round(base * mult);
}

export function reseedClouds(
  condition: WeatherCondition,
  width: number,
  rng: () => number,
): CloudEntity[] {
  const target = getTargetCloudCount(condition, 1);
  const clouds: CloudEntity[] = [];
  for (let i = 0; i < target; i++) {
    const variant = (i % 3) as 0 | 1 | 2;
    clouds.push({
      x: Math.floor(rng() * (width + 40)) - 20,
      y: 2 + Math.floor(rng() * 14),
      vx: 2.2 + rng() * 3.5,
      variant,
    });
  }
  return clouds;
}

export function stepClouds(
  clouds: CloudEntity[],
  dt: number,
  width: number,
  condition: WeatherCondition,
  mult: number,
  windPxPerSec: number,
  enabled: boolean,
  rng: () => number,
): void {
  if (!enabled) {
    clouds.length = 0;
    return;
  }
  const target = getTargetCloudCount(condition, mult);
  while (clouds.length < target) {
    const variant = Math.floor(rng() * 3) as 0 | 1 | 2;
    clouds.push({
      x: -36 - rng() * 25,
      y: 2 + Math.floor(rng() * 14),
      vx: 2.2 + rng() * 3.2,
      variant,
    });
  }
  if (clouds.length > target) {
    clouds.length = target;
  }

  const windFactor = 1 + windPxPerSec * 0.04;
  for (const cloud of clouds) {
    cloud.x += cloud.vx * windFactor * dt;
    if (cloud.x > width + 10) {
      cloud.x = -36;
      cloud.y = 2 + Math.floor(rng() * 14);
    }
  }
}

export function renderClouds(
  ctx: CanvasRenderingContext2D,
  clouds: readonly CloudEntity[],
  palette: PixelPalette,
): void {
  const colorMap = {
    H: palette.cloudHighlight,
    M: palette.cloudBody,
    S: palette.cloudShadow,
  };
  for (const cloud of clouds) {
    drawSprite(ctx, CLOUD_SPRITES[cloud.variant], cloud.x, cloud.y, colorMap);
  }
}

export function syncStarsToGrid(
  starPool: StarEntity[],
  stars: StarEntity[],
  width: number,
  height: number,
  rng: () => number,
): void {
  const starCount = Math.max(12, Math.floor((width * height) / 520));
  while (starPool.length < starCount) {
    starPool.push({
      normX: rng(),
      normY: rng(),
      x: 0,
      y: 0,
      phase: rng() * Math.PI * 2,
      speed: 1.5 + rng() * 3.0,
      colorIndex: Math.floor(rng() * 4),
    });
  }
  const maxY = Math.max(12, Math.floor(height * 0.48));
  stars.length = 0;
  for (let i = 0; i < starCount; i++) {
    const star = starPool[i];
    star.x = Math.floor(star.normX * width);
    star.y = Math.floor(star.normY * maxY);
    stars.push(star);
  }
}

export function renderStars(
  ctx: CanvasRenderingContext2D,
  stars: readonly StarEntity[],
  elapsedSec: number,
  palette: PixelPalette,
): void {
  for (const star of stars) {
    const pulse = Math.sin(elapsedSec * star.speed + star.phase);
    if (pulse < -0.35) continue;
    ctx.fillStyle = palette.starColors[star.colorIndex % palette.starColors.length];
    ctx.fillRect(star.x, star.y, 1, 1);
    if (pulse > 0.88) {
      ctx.fillRect(star.x - 1, star.y, 1, 1);
      ctx.fillRect(star.x + 1, star.y, 1, 1);
      ctx.fillRect(star.x, star.y - 1, 1, 1);
      ctx.fillRect(star.x, star.y + 1, 1, 1);
    }
  }
}

export function renderCelestial(
  ctx: CanvasRenderingContext2D,
  width: number,
  elapsedSec: number,
  condition: WeatherCondition,
  palette: PixelPalette,
): void {
  const marginX = Math.max(8, width - 20);
  const marginY = 4;

  if (condition === "clear-day" || condition === "partly-cloudy-day") {
    const frameIdx = Math.floor(elapsedSec * 1.4) % SUN_SPRITES.length;
    drawSprite(ctx, SUN_SPRITES[frameIdx], marginX, marginY, {
      H: palette.sunCore,
      M: palette.sunMid,
      S: palette.sunRay,
    });
  } else if (condition === "clear-night" || condition === "partly-cloudy-night") {
    drawSprite(ctx, MOON_SPRITE, marginX, marginY, {
      H: palette.moonCore,
      M: palette.moonShade,
    });
  }
}

export function spawnLightningBolt(
  width: number,
  height: number,
  rng: () => number,
): LightningBolt {
  const startX = Math.floor(width * (0.15 + rng() * 0.7));
  const startY = 8;
  const endY = Math.floor(height * (0.45 + rng() * 0.28));
  const segments: LightningSegment[] = [];

  let curX = startX;
  let curY = startY;
  while (curY < endY) {
    const stepY = 4 + Math.floor(rng() * 6);
    const nextY = Math.min(endY, curY + stepY);
    const nextX = curX + Math.floor((rng() - 0.5) * 10);
    segments.push({ x1: curX, y1: curY, x2: nextX, y2: nextY });

    if (rng() < 0.28 && curY < endY - 10) {
      const branchDir = rng() < 0.5 ? -1 : 1;
      const bx1 = nextX + branchDir * (3 + Math.floor(rng() * 5));
      const by1 = nextY + 4 + Math.floor(rng() * 5);
      segments.push({ x1: nextX, y1: nextY, x2: bx1, y2: by1 });
    }

    curX = nextX;
    curY = nextY;
  }

  return {
    segments,
    age: 0,
    maxAge: 0.24,
  };
}

export function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  let ix0 = Math.floor(x0);
  let iy0 = Math.floor(y0);
  const ix1 = Math.floor(x1);
  const iy1 = Math.floor(y1);
  const dx = Math.abs(ix1 - ix0);
  const sx = ix0 < ix1 ? 1 : -1;
  const dy = -Math.abs(iy1 - iy0);
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx + dy;

  ctx.fillStyle = color;
  while (true) {
    ctx.fillRect(ix0, iy0, 1, 1);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ix0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

export function renderLightning(
  ctx: CanvasRenderingContext2D,
  bolt: LightningBolt,
  palette: PixelPalette,
): void {
  if (bolt.age > bolt.maxAge * 0.7 && Math.floor(bolt.age * 40) % 2 === 0) {
    return;
  }
  for (const seg of bolt.segments) {
    drawPixelLine(ctx, seg.x1 - 1, seg.y1, seg.x2 - 1, seg.y2, palette.lightningGlow);
    drawPixelLine(ctx, seg.x1, seg.y1, seg.x2, seg.y2, palette.lightningCore);
  }
}

export function stepBirdsAndMotes(
  birds: BirdEntity[],
  motes: AmbientMote[],
  dt: number,
  width: number,
  height: number,
  condition: WeatherCondition,
  mult: number,
  rng: () => number,
): void {
  if (condition === "clear-day") {
    const targetBirds = mult > 1.2 ? 3 : 2;
    if (birds.length < targetBirds && rng() < dt * 0.35) {
      const fromLeft = rng() < 0.5;
      birds.push({
        x: fromLeft ? -8 : width + 6,
        y: 8 + Math.floor(rng() * Math.max(8, Math.floor(height * 0.2))),
        vx: (fromLeft ? 1 : -1) * (10 + rng() * 8),
        flapPhase: rng() * Math.PI * 2,
      });
    }
  }
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
    b.x += b.vx * dt;
    b.flapPhase += dt * 7;
    if (b.x < -12 || b.x > width + 12) {
      birds.splice(i, 1);
    }
  }

  const targetMotes =
    condition === "clear-day" || condition === "clear-night"
      ? Math.round(8 * mult)
      : 0;
  while (motes.length < targetMotes) {
    motes.push({
      x: rng() * width,
      y: height * (0.25 + rng() * 0.7),
      vx: (rng() - 0.5) * 4,
      vy: -1.5 - rng() * 2.5,
      phase: rng() * Math.PI * 2,
    });
  }
  if (motes.length > targetMotes) {
    motes.length = targetMotes;
  }
  for (const m of motes) {
    m.phase += dt * 2.5;
    m.x += (m.vx + Math.sin(m.phase) * 2.2) * dt;
    m.y += m.vy * dt;
    if (m.y < 6) {
      m.y = height - 4;
      m.x = rng() * width;
    }
    if (m.x < 0) m.x += width;
    if (m.x >= width) m.x -= width;
  }
}

export function renderBirdsAndMotes(
  ctx: CanvasRenderingContext2D,
  birds: readonly BirdEntity[],
  motes: readonly AmbientMote[],
  elapsedSec: number,
  condition: WeatherCondition,
  palette: PixelPalette,
): void {
  for (const bird of birds) {
    const frame = Math.sin(bird.flapPhase) > 0 ? 0 : 1;
    drawSprite(ctx, BIRD_FRAMES[frame], bird.x, bird.y, { S: palette.bird });
  }

  for (const mote of motes) {
    const blink = 0.55 + 0.45 * Math.sin(elapsedSec * 3 + mote.phase);
    if (blink < 0.35) continue;
    ctx.fillStyle = condition === "clear-night" ? palette.sunCore : palette.sunMid;
    ctx.fillRect(Math.floor(mote.x), Math.floor(mote.y), 1, 1);
  }
}
