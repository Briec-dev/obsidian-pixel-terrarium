import { clamp, lerp } from "../shared/math";
import type {
  BranchNode,
  Season,
  TimeOfDay,
  TreeSkeleton,
  TreeSpecies,
} from "../types";
import { getThemeParticleColor, type TreeWeatherInput } from "./palette";
import { isRainyCondition } from "./time-season";

export type ParticleKind =
  | "leaf"
  | "petal"
  | "snow"
  | "water"
  | "rain-splash"
  | "drip"
  | "frost"
  | "sparkle"
  | "note"
  | "heart";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  phase: number;
}

export const MAX_TREE_PARTICLES = 240;

export function pushParticle(particles: Particle[], p: Particle): boolean {
  if (particles.length >= MAX_TREE_PARTICLES) {
    return false;
  }
  particles.push(p);
  return true;
}

export function countParticles(particles: readonly Particle[], kind?: ParticleKind): number {
  if (!kind) return particles.length;
  let count = 0;
  for (const p of particles) {
    if (p.kind === kind) count++;
  }
  return count;
}

function pushEvictingSplash(particles: Particle[], p: Particle): void {
  if (particles.length >= MAX_TREE_PARTICLES) {
    const idx = particles.findIndex((existing) => existing.kind === "rain-splash");
    particles.splice(idx >= 0 ? idx : 0, 1);
  }
  particles.push(p);
}

export function spawnRainImpactParticles(
  particles: Particle[],
  x: number,
  y: number,
  windBias: number,
): void {
  const count = 2 + (Math.random() < 0.45 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 44 + windBias;
    pushEvictingSplash(particles, {
      kind: "rain-splash",
      x: x + (Math.random() - 0.5) * 3,
      y: y - 1,
      vx: spread,
      vy: -24 - Math.random() * 26,
      size: 2,
      life: 0,
      maxLife: 0.22 + Math.random() * 0.14,
      color: "#a8dcff",
      phase: 0,
    });
  }

  if (Math.random() < 0.14) {
    pushParticle(particles, {
      kind: "drip",
      x,
      y: y + 2,
      vx: windBias * 0.2,
      vy: 12 + Math.random() * 14,
      size: 2,
      life: 0,
      maxLife: 0.75 + Math.random() * 0.35,
      color: "#7ec8ff",
      phase: 0,
    });
  }
}

export function spawnSnowFrostParticle(
  particles: Particle[],
  normX: number,
  normY: number,
  width: number,
  height: number,
): void {
  if (Math.random() < 0.18) {
    const x = clamp(normX, 0, 1) * width;
    const y = clamp(normY, 0, 1) * height;
    pushParticle(particles, {
      kind: "frost",
      x,
      y,
      vx: (Math.random() - 0.5) * 6,
      vy: -4 - Math.random() * 6,
      size: 2,
      life: 0,
      maxLife: 0.35,
      color: "#ffffff",
      phase: 0,
    });
  }
}

export function spawnWaterSplashParticles(
  particles: Particle[],
  x: number,
  y: number,
): void {
  for (let i = 0; i < 16; i++) {
    const angle = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
    const speed = 35 + Math.random() * 55;
    if (
      !pushParticle(particles, {
        kind: "water",
        x: x + (Math.random() - 0.5) * 18,
        y: y - 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.5,
        life: 0,
        maxLife: 0.7 + Math.random() * 0.4,
        color: "#6bc4ff",
        phase: Math.random() * Math.PI * 2,
      })
    ) {
      break;
    }
  }
}

export function spawnShakeBurstParticles(
  particles: Particle[],
  skeleton: TreeSkeleton,
  foliageNodes: readonly BranchNode[],
  season: Season,
  species: TreeSpecies,
  isSnowy: boolean,
  windBias: number,
): void {
  const burstNodes =
    foliageNodes.length > 0
      ? foliageNodes
      : skeleton.branches.filter((b) => !b.isTrunk);
  if (burstNodes.length === 0) return;

  const kind: ParticleKind = isSnowy
    ? "snow"
    : season === "spring" && species === "sakura"
      ? "petal"
      : "leaf";

  const color =
    kind === "snow"
      ? "#e8f3ff"
      : kind === "petal"
        ? "#ffb8d2"
        : season === "autumn"
          ? Math.random() > 0.5
            ? "#e07a32"
            : "#e6b445"
          : "#5da657";

  const count = Math.min(18, 4 + burstNodes.length);
  for (let i = 0; i < count; i++) {
    const node = burstNodes[Math.floor(Math.random() * burstNodes.length)];
    const spread = Math.max(6, node.foliageRadius || 8);
    if (
      !pushParticle(particles, {
        kind,
        x: node.x2 + (Math.random() - 0.5) * spread,
        y: node.y2 + (Math.random() - 0.5) * spread * 0.6,
        vx: (Math.random() - 0.5) * 26 + windBias * 6,
        vy: 14 + Math.random() * 22,
        size: 3,
        life: 0,
        maxLife: 2.4 + Math.random() * 1.4,
        color,
        phase: Math.random() * Math.PI * 2,
      })
    ) {
      break;
    }
  }
}

export function spawnReactionBurstParticles(
  particles: Particle[],
  x: number,
  y: number,
  kind: "heart" | "note" | "sparkle",
): void {
  const count = kind === "sparkle" ? 8 : 3;
  const color =
    kind === "heart"
      ? "#ff7aa2"
      : kind === "note"
        ? "#ffd66b"
        : "#fff09c";
  for (let i = 0; i < count; i++) {
    if (
      !pushParticle(particles, {
        kind,
        x: x + (Math.random() - 0.5) * 14,
        y: y - 4,
        vx: (Math.random() - 0.5) * 24,
        vy: -22 - Math.random() * 20,
        size: 3,
        life: 0,
        maxLife: 1.1 + Math.random() * 0.5,
        color,
        phase: Math.random() * Math.PI * 2,
      })
    ) {
      break;
    }
  }
}

export function emitFallbackRainImpacts(
  dt: number,
  weather: TreeWeatherInput,
  solidMask: Uint8Array,
  maskW: number,
  maskH: number,
  onImpact: (normX: number, normY: number, windVx: number) => void,
): void {
  if (!weather.enabled || !weather.interactionsEnabled || weather.hasExternalOverlap) {
    return;
  }
  if (!isRainyCondition(weather.condition)) return;

  const baseRate =
    weather.condition === "drizzle"
      ? 4
      : weather.condition === "rain"
        ? 11
        : 20;
  const mult =
    weather.intensity === "subtle"
      ? 0.55
      : weather.intensity === "intense"
        ? 1.6
        : 1.0;
  const expected = baseRate * mult * dt;
  const count = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);

  for (let i = 0; i < count; i++) {
    const rx = Math.floor(Math.random() * maskW);
    for (let ry = 0; ry < maskH; ry++) {
      if (solidMask[ry * maskW + rx] > 0) {
        onImpact(
          (rx + 0.5) / maskW,
          (ry + 0.5) / maskH,
          weather.windSpeedKmh * 0.6,
        );
        break;
      }
    }
  }
}

export function emitSeasonalParticles(
  particles: Particle[],
  dt: number,
  skeleton: TreeSkeleton,
  foliageNodes: readonly BranchNode[],
  species: TreeSpecies,
  season: Season,
  timeOfDay: TimeOfDay,
  weather: TreeWeatherInput,
  snowCover: number,
  windBias: number,
): void {
  const gustFactor = weather.enabled && weather.interactionsEnabled
    ? clamp(1 + (weather.windSpeedKmh - 10) / 25, 1, 2.5)
    : 1;

  if (foliageNodes.length > 0) {
    if (season === "autumn" && Math.random() < 1.8 * gustFactor * dt) {
      const b = foliageNodes[Math.floor(Math.random() * foliageNodes.length)];
      pushParticle(particles, {
        kind: "leaf",
        x: b.x2 + (Math.random() - 0.5) * b.foliageRadius,
        y: b.y2,
        vx: -6 + Math.random() * 12 + windBias * 10,
        vy: 16 + Math.random() * 14,
        size: 3,
        life: 0,
        maxLife: 4.0,
        color: Math.random() > 0.4 ? "#d96a2b" : "#eab13d",
        phase: Math.random() * Math.PI * 2,
      });
    } else if (season === "spring" && species === "sakura" && Math.random() < 2.2 * gustFactor * dt) {
      const b = foliageNodes[Math.floor(Math.random() * foliageNodes.length)];
      pushParticle(particles, {
        kind: "petal",
        x: b.x2 + (Math.random() - 0.5) * b.foliageRadius,
        y: b.y2,
        vx: -8 + Math.random() * 14 + windBias * 10,
        vy: 12 + Math.random() * 12,
        size: 3,
        life: 0,
        maxLife: 4.5,
        color: "#ffc4dc",
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  if (
    snowCover > 0.45 &&
    weather.enabled &&
    weather.interactionsEnabled &&
    weather.windSpeedKmh > 18 &&
    Math.random() < 1.6 * dt
  ) {
    const pool = foliageNodes.length > 0 ? foliageNodes : skeleton.branches;
    if (pool.length > 0) {
      const b = pool[Math.floor(Math.random() * pool.length)];
      pushParticle(particles, {
        kind: "snow",
        x: b.x2 + (Math.random() - 0.5) * 10,
        y: b.y2,
        vx: windBias * 14,
        vy: 14 + Math.random() * 12,
        size: 2,
        life: 0,
        maxLife: 2.5,
        color: "#e6f2ff",
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  const badWeather =
    weather.enabled &&
    weather.interactionsEnabled &&
    (isRainyCondition(weather.condition) || weather.condition === "snow");
  if (timeOfDay === "night" && season !== "winter" && !badWeather && Math.random() < 1.4 * dt) {
    const box = skeleton.boundingBox;
    pushParticle(particles, {
      kind: "sparkle",
      x: lerp(box.minX, box.maxX, Math.random()),
      y: lerp(box.minY, box.maxY, Math.random()),
      vx: (Math.random() - 0.5) * 10,
      vy: -4 + (Math.random() - 0.5) * 8,
      size: 2,
      life: 0,
      maxLife: 2.5,
      color: "#d9ff78",
      phase: Math.random() * Math.PI * 2,
    });
  }
}

export function stepParticles(
  particles: Particle[],
  dt: number,
  groundY: number,
  windTime: number,
  windBias: number,
): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife || p.y > groundY + 2) {
      particles.splice(i, 1);
      continue;
    }
    if (p.kind === "water" || p.kind === "rain-splash") {
      p.vy += 175 * dt;
    } else if (p.kind === "drip") {
      p.vy += 140 * dt;
    } else if (p.kind === "leaf" || p.kind === "petal") {
      p.vx += (Math.sin(windTime * 2.5 + p.phase) * 18 + windBias * 10) * dt;
      p.vx = clamp(p.vx, -36, 42);
    } else if (p.kind === "snow") {
      p.vx = Math.sin(windTime * 1.6 + p.phase) * 10 + windBias * 14;
    } else if (p.kind === "sparkle") {
      p.vx += Math.cos(windTime * 2 + p.phase) * 12 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function renderParticles(
  pctx: CanvasRenderingContext2D,
  particles: readonly Particle[],
  pixelScale: number,
  pw: number,
  ph: number,
  isLight: boolean,
): void {
  let lastParticleColor = "";
  for (const p of particles) {
    const px = Math.round(p.x / pixelScale);
    const py = Math.round(p.y / pixelScale);
    if (px < 0 || px >= pw || py < 0 || py >= ph) continue;
    const color =
      p.kind === "heart"
        ? "#ff7aa2"
        : getThemeParticleColor(p.kind, p.color, isLight);
    if (color !== lastParticleColor) {
      pctx.fillStyle = color;
      lastParticleColor = color;
    }
    if (p.kind === "heart") {
      pctx.fillRect(px - 1, py - 1, 1, 1);
      pctx.fillRect(px + 1, py - 1, 1, 1);
      pctx.fillRect(px, py, 1, 1);
    } else {
      pctx.fillRect(px, py, 1, 1);
    }
  }
}
