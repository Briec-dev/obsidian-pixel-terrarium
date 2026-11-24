import {
  drawSprite,
  SNOWFLAKE_CROSS_3X3,
  SNOWFLAKE_CRYSTAL_5X5,
  type PixelPalette,
} from "../pixel-sprites";
import type { WeatherCondition } from "../types";
import {
  buildTreeRainCollisionBox,
  checkSnowflakeAgainstTree,
  traceRaindropAgainstTree,
  type TreeCollisionTarget,
} from "./collision";

export interface Raindrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  bright: boolean;
}

export interface Splash {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

export interface Snowflake {
  x: number;
  y: number;
  vy: number;
  phase: number;
  swayAmp: number;
  swayFreq: number;
  kind: 0 | 1 | 2 | 3; // 0: 1x1, 1: 2x2, 2: 3x3 cross, 3: 5x5 crystal
  ignoreTree?: boolean;
}

export function stepRain(
  raindrops: Raindrop[],
  splashes: Splash[],
  dt: number,
  width: number,
  height: number,
  condition: WeatherCondition,
  mult: number,
  windPxPerSec: number,
  allowSplashes: boolean,
  treeCollider: TreeCollisionTarget | null,
  rng: () => number,
): void {
  let baseCount = 0;
  let speedMin = 70;
  let speedMax = 105;
  let streakLen = 3;

  if (condition === "drizzle") {
    baseCount = Math.floor((width * height) / 520);
    speedMin = 42;
    speedMax = 65;
    streakLen = 2;
  } else if (condition === "rain") {
    baseCount = Math.floor((width * height) / 230);
    speedMin = 85;
    speedMax = 125;
    streakLen = 3;
  } else if (condition === "heavy-rain" || condition === "thunderstorm") {
    baseCount = Math.floor((width * height) / 135);
    speedMin = 115;
    speedMax = 165;
    streakLen = 4;
  }

  const target = Math.round(baseCount * mult);
  const leftPad = windPxPerSec > 0 ? Math.min(18, Math.ceil(windPxPerSec * 0.8) + 4) : 2;
  const rightPad = windPxPerSec < 0 ? Math.min(18, Math.ceil(-windPxPerSec * 0.8) + 4) : 0;
  const spawnSpan = width + leftPad + rightPad;

  while (raindrops.length < target) {
    raindrops.push({
      x: rng() * spawnSpan - leftPad,
      y: -rng() * height,
      vx: windPxPerSec + (rng() - 0.5) * 6,
      vy: speedMin + rng() * (speedMax - speedMin),
      len: streakLen + (rng() > 0.7 ? 1 : 0),
      bright: rng() > 0.65,
    });
  }
  if (raindrops.length > target) {
    raindrops.length = target;
  }

  const floorY = height - 1;
  const rainBox = buildTreeRainCollisionBox(treeCollider);

  for (const drop of raindrops) {
    const prevX = drop.x;
    const prevY = drop.y;
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;

    if (rainBox && treeCollider && drop.y + drop.len >= 0) {
      const outcome = traceRaindropAgainstTree(
        rainBox,
        treeCollider,
        prevX,
        prevY,
        drop.x,
        drop.y,
        drop.vx,
        drop.len,
      );
      if (outcome === "reset") {
        drop.x = rng() * spawnSpan - leftPad;
        drop.y = -4 - rng() * 14;
        drop.vx = windPxPerSec + (rng() - 0.5) * 6;
        continue;
      }
    }

    if (drop.y >= floorY) {
      if (allowSplashes && splashes.length < 48 && rng() < 0.45) {
        splashes.push({
          x: Math.floor(drop.x),
          y: floorY,
          age: 0,
          maxAge: 0.22,
        });
      }
      drop.x = rng() * spawnSpan - leftPad;
      drop.y = -4 - rng() * 14;
      drop.vx = windPxPerSec + (rng() - 0.5) * 6;
    } else if (drop.x > width + 18) {
      drop.x = -12;
    } else if (drop.x < -18) {
      drop.x = width + 12;
    }
  }
}

export function stepSplashes(splashes: Splash[], dt: number): void {
  for (let i = splashes.length - 1; i >= 0; i--) {
    splashes[i].age += dt;
    if (splashes[i].age >= splashes[i].maxAge) {
      splashes.splice(i, 1);
    }
  }
}

export function renderRain(
  ctx: CanvasRenderingContext2D,
  raindrops: readonly Raindrop[],
  width: number,
  height: number,
  palette: PixelPalette,
): void {
  for (const brightPass of [false, true]) {
    ctx.fillStyle = brightPass ? palette.rainHighlight : palette.rainPrimary;
    for (const drop of raindrops) {
      if (drop.bright !== brightPass) continue;
      const ix = Math.floor(drop.x);
      const iy = Math.floor(drop.y);
      const slant = drop.vx > 8 ? 1 : drop.vx < -8 ? -1 : 0;
      if (slant === 0) {
        if (ix < 0 || ix >= width) continue;
        const y0 = Math.max(0, iy);
        const y1 = Math.min(height, iy + drop.len);
        if (y1 > y0) {
          ctx.fillRect(ix, y0, 1, y1 - y0);
        }
        continue;
      }
      let segX = ix;
      let segY = iy;
      let segLen = 0;
      for (let i = 0; i < drop.len; i++) {
        const px = ix + Math.floor((slant * i) / 2);
        const py = iy + i;
        if (py >= 0 && py < height && px >= 0 && px < width) {
          if (segLen > 0 && px === segX && py === segY + segLen) {
            segLen++;
          } else {
            if (segLen > 0) {
              ctx.fillRect(segX, segY, 1, segLen);
            }
            segX = px;
            segY = py;
            segLen = 1;
          }
        }
      }
      if (segLen > 0) {
        ctx.fillRect(segX, segY, 1, segLen);
      }
    }
  }
}

export function renderSplashes(
  ctx: CanvasRenderingContext2D,
  splashes: readonly Splash[],
  width: number,
  palette: PixelPalette,
): void {
  ctx.fillStyle = palette.splash;
  for (const splash of splashes) {
    const progress = splash.age / splash.maxAge;
    const spread = progress < 0.5 ? 1 : 2;
    const y = splash.y - (progress < 0.6 ? 1 : 0);
    if (splash.x - spread >= 0) ctx.fillRect(splash.x - spread, y, 1, 1);
    if (splash.x + spread < width) ctx.fillRect(splash.x + spread, y, 1, 1);
    if (progress < 0.45 && splash.x >= 0 && splash.x < width) {
      ctx.fillRect(splash.x, splash.y - 1, 1, 1);
    }
  }
}

export function resizeSnowHeight(oldSnow: Float32Array, nextW: number): Float32Array {
  const nextSnow = new Float32Array(nextW);
  for (let x = 0; x < nextW; x++) {
    const srcIdx = Math.min(oldSnow.length - 1, Math.floor((x / nextW) * oldSnow.length));
    nextSnow[x] = oldSnow[srcIdx] ?? 0;
  }
  return nextSnow;
}

export function getMaxSnowHeight(snowHeight: Float32Array): number {
  let max = 0;
  for (let i = 0; i < snowHeight.length; i++) {
    if (snowHeight[i] > max) max = snowHeight[i];
  }
  return max;
}

export function stepSnow(
  snowflakes: Snowflake[],
  snowHeight: Float32Array,
  dt: number,
  width: number,
  height: number,
  condition: WeatherCondition,
  mult: number,
  windPxPerSec: number,
  allowGround: boolean,
  treeCollider: TreeCollisionTarget | null,
  rng: () => number,
): void {
  const target = condition === "snow"
    ? Math.round(Math.max(18, (width * height) / 360) * mult)
    : 0;

  while (snowflakes.length < target) {
    const r = rng();
    const kind: 0 | 1 | 2 | 3 = r < 0.45 ? 0 : r < 0.75 ? 1 : r < 0.93 ? 2 : 3;
    snowflakes.push({
      x: rng() * width,
      y: -rng() * height,
      vy: 14 + rng() * 18,
      phase: rng() * Math.PI * 2,
      swayAmp: 4 + rng() * 7,
      swayFreq: 1.2 + rng() * 1.6,
      kind,
      ignoreTree: false,
    });
  }
  if (snowflakes.length > target) {
    snowflakes.length = target;
  }

  const drift = windPxPerSec * 0.45;
  for (const flake of snowflakes) {
    flake.phase += flake.swayFreq * dt;
    flake.x += (Math.sin(flake.phase) * flake.swayAmp + drift) * dt;
    flake.y += flake.vy * dt;

    if (flake.x >= width) flake.x -= width;
    if (flake.x < 0) flake.x += width;
    if (flake.y < 0) flake.ignoreTree = false;

    if (treeCollider && !flake.ignoreTree && flake.y >= 0) {
      const outcome = checkSnowflakeAgainstTree(treeCollider, flake.x, flake.y, rng);
      if (outcome === "reset") {
        flake.x = rng() * width;
        flake.y = -3 - rng() * 10;
        flake.ignoreTree = false;
        continue;
      }
      if (outcome === "pass") {
        flake.ignoreTree = true;
      }
    }

    const col = Math.min(width - 1, Math.max(0, Math.floor(flake.x)));
    const groundTop = height - 1 - Math.floor(snowHeight[col]);

    if (flake.y >= groundTop) {
      if (allowGround && snowHeight[col] < 4) {
        snowHeight[col] = Math.min(4, snowHeight[col] + 0.35);
        if (col > 0 && snowHeight[col - 1] < snowHeight[col] - 1) {
          snowHeight[col - 1] += 0.2;
        }
        if (col < width - 1 && snowHeight[col + 1] < snowHeight[col] - 1) {
          snowHeight[col + 1] += 0.2;
        }
      }
      flake.x = rng() * width;
      flake.y = -3 - rng() * 10;
      flake.ignoreTree = false;
    }
  }

  // Gently melt snow when weather is not snowy (or if accumulation disabled)
  if (condition !== "snow" || !allowGround) {
    const meltRate = dt * 0.9;
    for (let x = 0; x < snowHeight.length; x++) {
      if (snowHeight[x] > 0) {
        snowHeight[x] = Math.max(0, snowHeight[x] - meltRate);
      }
    }
  }
}

export function renderSnow(
  ctx: CanvasRenderingContext2D,
  snowflakes: readonly Snowflake[],
  palette: PixelPalette,
): void {
  // Pass 1: 2x2 snowflake rims
  ctx.fillStyle = palette.snowRim;
  for (const flake of snowflakes) {
    if (flake.kind === 1) {
      ctx.fillRect(Math.floor(flake.x), Math.floor(flake.y), 2, 2);
    }
  }

  // Pass 2: 1x1 cores for kinds 0 and 1
  ctx.fillStyle = palette.snowCore;
  for (const flake of snowflakes) {
    if (flake.kind === 0 || flake.kind === 1) {
      ctx.fillRect(Math.floor(flake.x), Math.floor(flake.y), 1, 1);
    }
  }

  // Pass 3: sprite crystals (kinds 2 and 3)
  const spriteColors = {
    H: palette.snowCore,
    S: palette.snowRim,
  };
  for (const flake of snowflakes) {
    if (flake.kind === 2) {
      drawSprite(
        ctx,
        SNOWFLAKE_CROSS_3X3,
        Math.floor(flake.x) - 1,
        Math.floor(flake.y) - 1,
        spriteColors,
      );
    } else if (flake.kind === 3) {
      drawSprite(
        ctx,
        SNOWFLAKE_CRYSTAL_5X5,
        Math.floor(flake.x) - 2,
        Math.floor(flake.y) - 2,
        spriteColors,
      );
    }
  }
}

export function renderSnowGround(
  ctx: CanvasRenderingContext2D,
  snowHeight: Float32Array,
  width: number,
  height: number,
  palette: PixelPalette,
): void {
  let x = 0;
  while (x < width) {
    const h = Math.floor(snowHeight[x] ?? 0);
    if (h <= 0) {
      x++;
      continue;
    }
    let end = x + 1;
    while (end < width && Math.floor(snowHeight[end] ?? 0) === h) {
      end++;
    }
    const runLen = end - x;
    const topY = height - h;
    ctx.fillStyle = palette.snowGroundTop;
    ctx.fillRect(x, topY, runLen, 1);
    if (h > 1) {
      ctx.fillStyle = palette.snowGroundBase;
      ctx.fillRect(x, topY + 1, runLen, h - 1);
    }
    x = end;
  }
}
