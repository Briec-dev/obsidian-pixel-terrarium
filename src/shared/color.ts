import { clamp, lerp } from "./math";

const HEX_BYTE: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);
const HEX_RGB_CACHE = new Map<string, [number, number, number] | null>();
const AMBIENT_LIGHT_CACHE = new Map<string, Map<number, string>>();
const LERP_HEX_CACHE = new Map<string, Map<string, Map<number, string>>>();
let ambientCacheCount = 0;
let lerpCacheCount = 0;

export function parseHexRgb(hex: string): [number, number, number] | null {
  const cached = HEX_RGB_CACHE.get(hex);
  if (cached !== undefined) return cached;
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length !== 6) {
    if (HEX_RGB_CACHE.size >= 256) HEX_RGB_CACHE.clear();
    HEX_RGB_CACHE.set(hex, null);
    return null;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const res: [number, number, number] | null =
    Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : [r, g, b];
  if (HEX_RGB_CACHE.size >= 256) HEX_RGB_CACHE.clear();
  HEX_RGB_CACHE.set(hex, res);
  return res;
}

export function toHexRgb(r: number, g: number, b: number): string {
  const cr = r <= 0 ? 0 : r >= 255 ? 255 : Math.round(r);
  const cg = g <= 0 ? 0 : g >= 255 ? 255 : Math.round(g);
  const cb = b <= 0 ? 0 : b >= 255 ? 255 : Math.round(b);
  return `#${HEX_BYTE[cr]}${HEX_BYTE[cg]}${HEX_BYTE[cb]}`;
}

export function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const factor = clamp(t, 0, 1);
  if (factor <= 0.001) return hexA;
  if (factor >= 0.999) return hexB;
  let mB = LERP_HEX_CACHE.get(hexA);
  let mF = mB?.get(hexB);
  const cached = mF?.get(factor);
  if (cached !== undefined) return cached;
  const a = parseHexRgb(hexA);
  const b = parseHexRgb(hexB);
  const out = !a || !b
    ? hexA
    : toHexRgb(
        lerp(a[0], b[0], factor),
        lerp(a[1], b[1], factor),
        lerp(a[2], b[2], factor),
      );
  if (lerpCacheCount >= 512) {
    LERP_HEX_CACHE.clear();
    lerpCacheCount = 0;
    mB = undefined;
    mF = undefined;
  }
  if (!mB) {
    mB = new Map();
    LERP_HEX_CACHE.set(hexA, mB);
  }
  if (!mF) {
    mF = new Map();
    mB.set(hexB, mF);
  }
  mF.set(factor, out);
  lerpCacheCount++;
  return out;
}

export function applyAmbientLight(hex: string, ambientLight: number): string {
  const factor = clamp(ambientLight, 0.1, 1.35);
  if (Math.abs(factor - 1) < 0.001) return hex;
  let mF = AMBIENT_LIGHT_CACHE.get(hex);
  const cached = mF?.get(factor);
  if (cached !== undefined) return cached;
  const rgb = parseHexRgb(hex);
  const out = !rgb ? hex : toHexRgb(rgb[0] * factor, rgb[1] * factor, rgb[2] * factor);
  if (ambientCacheCount >= 512) {
    AMBIENT_LIGHT_CACHE.clear();
    ambientCacheCount = 0;
    mF = undefined;
  }
  if (!mF) {
    mF = new Map();
    AMBIENT_LIGHT_CACHE.set(hex, mF);
  }
  mF.set(factor, out);
  ambientCacheCount++;
  return out;
}
