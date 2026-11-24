import type { WeatherCondition } from "./types";

export interface PixelPalette {
  sunCore: string;
  sunMid: string;
  sunRay: string;
  moonCore: string;
  moonShade: string;
  starColors: readonly string[];
  cloudHighlight: string;
  cloudBody: string;
  cloudShadow: string;
  rainPrimary: string;
  rainHighlight: string;
  splash: string;
  snowCore: string;
  snowRim: string;
  snowGroundTop: string;
  snowGroundBase: string;
  lightningCore: string;
  lightningGlow: string;
  fogPrimary: string;
  fogSecondary: string;
  sunbeam: string;
  skyTint: string;
  bird: string;
}

const DARK_PIXEL_PALETTES = new Map<WeatherCondition, PixelPalette>();
const LIGHT_PIXEL_PALETTES = new Map<WeatherCondition, PixelPalette>();

export function getPixelPalette(isDarkTheme: boolean, condition: WeatherCondition): PixelPalette {
  const bucket = isDarkTheme ? DARK_PIXEL_PALETTES : LIGHT_PIXEL_PALETTES;
  const cached = bucket.get(condition);
  if (cached) return cached;

  const isStormy =
    condition === "rain" ||
    condition === "heavy-rain" ||
    condition === "thunderstorm" ||
    condition === "cloudy";

  let palette: PixelPalette;
  if (isDarkTheme) {
    palette = {
      sunCore: "#fff5bd",
      sunMid: "#ffd452",
      sunRay: "#ff9b3d",
      moonCore: "#eef4ff",
      moonShade: "#9db0d9",
      starColors: ["#ffffff", "#fff1b8", "#9fd8ff", "#cbd9ff"],
      cloudHighlight: isStormy ? "#7c8ca8" : "#f4f8ff",
      cloudBody: isStormy ? "#5b6a85" : "#c6d4eb",
      cloudShadow: isStormy ? "#394459" : "#7e92b5",
      rainPrimary: condition === "drizzle" ? "#8bb8de" : "#6bbcff",
      rainHighlight: "#c7e7ff",
      splash: "#a8dcff",
      snowCore: "#ffffff",
      snowRim: "#bfe0ff",
      snowGroundTop: "#f0f7ff",
      snowGroundBase: "#a8c7e8",
      lightningCore: "#ffffff",
      lightningGlow: "#fff099",
      fogPrimary: "#9cb0c9",
      fogSecondary: "#6f829c",
      sunbeam: "#ffe680",
      skyTint:
        condition === "thunderstorm"
          ? "rgba(14, 22, 42, 0.24)"
          : condition === "rain" || condition === "heavy-rain"
            ? "rgba(22, 38, 66, 0.16)"
            : condition === "clear-night" || condition === "partly-cloudy-night"
              ? "rgba(12, 18, 38, 0.16)"
              : "rgba(0, 0, 0, 0)",
      bird: "#cbd8f0",
    };
  } else {
    palette = {
      sunCore: "#fde047",
      sunMid: "#f59e0b",
      sunRay: "#ea580c",
      moonCore: "#475569",
      moonShade: "#94a3b8",
      starColors: ["#6366f1", "#4f46e5", "#d97706", "#64748b"],
      cloudHighlight: isStormy ? "#94a3b8" : "#e2e8f0",
      cloudBody: isStormy ? "#64748b" : "#cbd5e1",
      cloudShadow: isStormy ? "#475569" : "#94a3b8",
      rainPrimary: condition === "drizzle" ? "#60a5fa" : "#2563eb",
      rainHighlight: "#60a5fa",
      splash: "#3b82f6",
      snowCore: "#bae6fd",
      snowRim: "#64748b",
      snowGroundTop: "#e0f2fe",
      snowGroundBase: "#93c5fd",
      lightningCore: "#eab308",
      lightningGlow: "#f59e0b",
      fogPrimary: "#64748b",
      fogSecondary: "#94a3b8",
      sunbeam: "#f59e0b",
      skyTint:
        condition === "thunderstorm"
          ? "rgba(51, 65, 85, 0.12)"
          : condition === "rain" || condition === "heavy-rain"
            ? "rgba(71, 85, 105, 0.08)"
            : condition === "clear-night" || condition === "partly-cloudy-night"
              ? "rgba(30, 41, 59, 0.08)"
              : "rgba(0, 0, 0, 0)",
      bird: "#475569",
    };
  }

  bucket.set(condition, palette);
  return palette;
}

// Sprite characters:
// '.' = transparent
// 'H' = highlight / core
// 'M' = mid / body
// 'S' = shadow / ray / rim

export const SUN_SPRITES: readonly (readonly string[])[] = [
  [
    "......S......",
    "..S...S...S..",
    "...S..M..S...",
    "....MMMMM....",
    "...MMHHHMM...",
    "..MMHHHHHMM..",
    "SSMMHHHHHMMSS",
    "..MMHHHHHMM..",
    "...MMHHHMM...",
    "....MMMMM....",
    "...S..M..S...",
    "..S...S...S..",
    "......S......",
  ],
  [
    ".....S.S.....",
    ".............",
    ".S...MMM...S.",
    "..S.MMMMM.S..",
    "...MMHHHMM...",
    "S.MMHHHHHMM.S",
    "..MMHHHHHMM..",
    "S.MMHHHHHMM.S",
    "...MMHHHMM...",
    "..S.MMMMM.S..",
    ".S...MMM...S.",
    ".............",
    ".....S.S.....",
  ],
];

export const MOON_SPRITE: readonly string[] = [
  "....MMMM...",
  "..MMHHHHM..",
  ".MMHHHMM...",
  ".MHHHM.....",
  "MHHHM......",
  "MHHHM......",
  "MHHHM......",
  ".MHHHM.....",
  ".MMHHHMM...",
  "..MMHHHHM..",
  "....MMMM...",
];

export const CLOUD_SPRITES: readonly (readonly string[])[] = [
  // Small cloud (18x8)
  [
    ".....HHHH.........",
    "...HHMMMMHH.......",
    "..HMMMMMMMMHHH....",
    ".HMMMMMMMMMMMMH...",
    "HMMMMMMMMMMMMMMH..",
    "MMMMMMMMMMMMMMMMM.",
    ".SSSSSSSSSSSSSSSS.",
    "..SSSSSSSSSSSSSS..",
  ],
  // Medium cloud (26x10)
  [
    "........HHHHHH............",
    "......HHMMMMMMHH..........",
    "....HHMMMMMMMMMMHHH.......",
    "...HMMMMMMMMMMMMMMMH......",
    ".HHMMMMMMMMMMMMMMMMMHH....",
    "HMMMMMMMMMMMMMMMMMMMMMMH..",
    "MMMMMMMMMMMMMMMMMMMMMMMMM.",
    "MMMMMMMMMMMMMMMMMMMMMMMMMM",
    ".SSSSSSSSSSSSSSSSSSSSSSSS.",
    "..SSSSSSSSSSSSSSSSSSSSSS..",
  ],
  // Wide cloud (32x11)
  [
    "..........HHHHHHH...............",
    "........HHMMMMMMMHH.............",
    "......HHMMMMMMMMMMMHHH..........",
    "....HHMMMMMMMMMMMMMMMMHH........",
    "..HHMMMMMMMMMMMMMMMMMMMMHHH.....",
    ".HMMMMMMMMMMMMMMMMMMMMMMMMMH....",
    "HMMMMMMMMMMMMMMMMMMMMMMMMMMMH...",
    "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM..",
    "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.",
    ".SSSSSSSSSSSSSSSSSSSSSSSSSSSSS..",
    "...SSSSSSSSSSSSSSSSSSSSSSSSS....",
  ],
];

export const SNOWFLAKE_CRYSTAL_5X5: readonly string[] = [
  "S.H.S",
  ".HHH.",
  "HHHHH",
  ".HHH.",
  "S.H.S",
];

export const SNOWFLAKE_CROSS_3X3: readonly string[] = [
  ".S.",
  "SHS",
  ".S.",
];

export const BIRD_FRAMES: readonly (readonly string[])[] = [
  [
    "S...S",
    ".S.S.",
    "..S..",
  ],
  [
    ".....",
    "SS.SS",
    "..S..",
  ],
];

interface SpriteSpan {
  row: number;
  col: number;
  len: number;
}

interface CompiledSprite {
  width: number;
  height: number;
  groups: Array<{ ch: string; spans: SpriteSpan[] }>;
  canvasCache: Map<string, HTMLCanvasElement>;
}

const COMPILED_SPRITES = new WeakMap<readonly string[], CompiledSprite>();

function compileSprite(sprite: readonly string[]): CompiledSprite {
  const existing = COMPILED_SPRITES.get(sprite);
  if (existing) return existing;

  const byChar = new Map<string, SpriteSpan[]>();
  let maxWidth = 0;

  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row];
    if (line.length > maxWidth) maxWidth = line.length;
    let col = 0;
    while (col < line.length) {
      const ch = line[col];
      if (ch === ".") {
        col++;
        continue;
      }
      let end = col + 1;
      while (end < line.length && line[end] === ch) {
        end++;
      }
      let list = byChar.get(ch);
      if (!list) {
        list = [];
        byChar.set(ch, list);
      }
      list.push({ row, col, len: end - col });
      col = end;
    }
  }

  const groups: Array<{ ch: string; spans: SpriteSpan[] }> = [];
  for (const [ch, spans] of byChar.entries()) {
    groups.push({ ch, spans });
  }

  const compiled: CompiledSprite = {
    width: Math.max(1, maxWidth),
    height: Math.max(1, sprite.length),
    groups,
    canvasCache: new Map(),
  };
  COMPILED_SPRITES.set(sprite, compiled);
  return compiled;
}

function drawCompiledSpans(
  ctx: CanvasRenderingContext2D,
  compiled: CompiledSprite,
  offsetX: number,
  offsetY: number,
  colorMap: Record<string, string>,
): void {
  for (const group of compiled.groups) {
    const color = colorMap[group.ch];
    if (!color) continue;
    ctx.fillStyle = color;
    for (const span of group.spans) {
      ctx.fillRect(offsetX + span.col, offsetY + span.row, span.len, 1);
    }
  }
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: readonly string[],
  x: number,
  y: number,
  colorMap: Record<string, string>,
): void {
  const startX = Math.floor(x);
  const startY = Math.floor(y);
  const compiled = compileSprite(sprite);

  if (typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined") {
    let colorKey = "";
    for (let i = 0; i < compiled.groups.length; i++) {
      const color = colorMap[compiled.groups[i].ch] ?? "";
      colorKey = i === 0 ? color : `${colorKey}|${color}`;
    }

    let cached = compiled.canvasCache.get(colorKey);
    if (!cached) {
      const offscreen = document.createElement("canvas");
      offscreen.width = compiled.width;
      offscreen.height = compiled.height;
      const octx = offscreen.getContext("2d");
      if (octx) {
        drawCompiledSpans(octx, compiled, 0, 0, colorMap);
        if (compiled.canvasCache.size >= 64) {
          compiled.canvasCache.clear();
        }
        compiled.canvasCache.set(colorKey, offscreen);
        cached = offscreen;
      }
    }

    if (cached) {
      ctx.drawImage(cached, startX, startY);
      return;
    }
  }

  drawCompiledSpans(ctx, compiled, startX, startY, colorMap);
}

// 4x4 Bayer ordered dithering matrix normalized 0..15
export const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function bayerThreshold(x: number, y: number): number {
  const xi = ((x % 4) + 4) % 4;
  const yi = ((y % 4) + 4) % 4;
  return (BAYER_4X4[yi][xi] + 0.5) / 16;
}
