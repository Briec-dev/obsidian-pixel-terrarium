import { bayerThreshold, type PixelPalette } from "../pixel-sprites";
import { parseHexRgb } from "../shared/color";
import type { EffectIntensity } from "../types";

export function getIntensityMultiplier(intensity: EffectIntensity): number {
  switch (intensity) {
    case "subtle":
      return 0.55;
    case "intense":
      return 1.65;
    case "normal":
    default:
      return 1.0;
  }
}

const SIN_LUT_SIZE = 1024;
const SIN_LUT = new Float32Array(SIN_LUT_SIZE);
for (let i = 0; i < SIN_LUT_SIZE; i++) {
  SIN_LUT[i] = Math.sin((i / SIN_LUT_SIZE) * Math.PI * 2);
}
const SIN_TWO_PI_INV = SIN_LUT_SIZE / (Math.PI * 2);

const BAYER_FLAT = new Float32Array(16);
for (let y = 0; y < 4; y++) {
  for (let x = 0; x < 4; x++) {
    BAYER_FLAT[y * 4 + x] = bayerThreshold(x, y);
  }
}

const IS_LITTLE_ENDIAN =
  new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;

export class SunbeamRenderer {
  private cacheKey = "";
  private count = 0;
  private xs = new Uint16Array(0);
  private ys = new Uint16Array(0);
  private sinA = new Float32Array(0);
  private cosA = new Float32Array(0);

  invalidate(): void {
    this.cacheKey = "";
  }

  private ensureCache(width: number, height: number): void {
    const key = `${width}|${height}`;
    if (this.cacheKey === key) return;
    this.cacheKey = key;

    const sunCenterX = width - 14;
    const sunCenterY = 10;
    const maxDist = Math.min(width, height) * 0.58;
    const minX = Math.max(0, Math.floor(sunCenterX - maxDist));
    const maxY = Math.min(height, Math.ceil(sunCenterY + maxDist));

    const xs: number[] = [];
    const ys: number[] = [];
    const sinAs: number[] = [];
    const cosAs: number[] = [];

    for (let y = 0; y < maxY; y++) {
      const dy = y - sunCenterY;
      if (dy < 0) continue;
      for (let x = minX; x < width; x++) {
        const dx = sunCenterX - x;
        if (dx < 0) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist || dist < 9) continue;

        const falloff = (1 - dist / maxDist) * 0.65;
        if (falloff <= bayerThreshold(x, y)) continue;

        const angle7 = Math.atan2(dy, dx) * 7;
        xs.push(x);
        ys.push(y);
        sinAs.push(Math.sin(angle7));
        cosAs.push(Math.cos(angle7));
      }
    }

    this.count = xs.length;
    this.xs = Uint16Array.from(xs);
    this.ys = Uint16Array.from(ys);
    this.sinA = Float32Array.from(sinAs);
    this.cosA = Float32Array.from(cosAs);
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    elapsedSec: number,
    palette: PixelPalette,
    strength: number,
  ): void {
    this.ensureCache(width, height);
    const count = this.count;
    if (count === 0) return;

    const shimmer = 0.85 + 0.15 * Math.sin(elapsedSec * 1.5);
    const phase = elapsedSec * 0.25;
    const cosP = Math.cos(phase);
    const sinP = Math.sin(phase);

    ctx.save();
    ctx.fillStyle = palette.sunbeam;
    ctx.globalAlpha = 0.22 * strength * shimmer;

    const xs = this.xs;
    const ys = this.ys;
    const sinA = this.sinA;
    const cosA = this.cosA;

    let spanY = -1;
    let spanX = 0;
    let spanLen = 0;

    for (let i = 0; i < count; i++) {
      if (sinA[i] * cosP + cosA[i] * sinP >= 0.35) {
        const px = xs[i];
        const py = ys[i];
        if (py === spanY && px === spanX + spanLen) {
          spanLen++;
        } else {
          if (spanLen > 0) {
            ctx.fillRect(spanX, spanY, spanLen, 1);
          }
          spanY = py;
          spanX = px;
          spanLen = 1;
        }
      }
    }
    if (spanLen > 0) {
      ctx.fillRect(spanX, spanY, spanLen, 1);
    }
    ctx.restore();
  }
}

export class FogRenderer {
  canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;
  cells: Uint8Array = new Uint8Array(0);
  private rowMask: Uint8Array = new Uint8Array(0);
  private key = "";

  invalidate(): void {
    this.key = "";
  }

  release(): void {
    if (
      this.canvas !== null ||
      this.ctx !== null ||
      this.imageData !== null ||
      this.cells.length > 0 ||
      this.rowMask.length > 0 ||
      this.key !== ""
    ) {
      this.canvas = null;
      this.ctx = null;
      this.imageData = null;
      this.cells = new Uint8Array(0);
      this.rowMask = new Uint8Array(0);
      this.key = "";
    }
  }

  private renderSpans(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    palette: PixelPalette,
  ): void {
    const cells = this.cells;
    const rowMask = this.rowMask;
    for (const targetCell of [1, 2] as const) {
      ctx.fillStyle = targetCell === 1 ? palette.fogPrimary : palette.fogSecondary;
      for (let y = 0; y < h; y++) {
        if ((rowMask[y] & targetCell) === 0) continue;
        const rowBase = y * w;
        let x = 0;
        while (x < w) {
          if (cells[rowBase + x] !== targetCell) {
            x++;
            continue;
          }
          let end = x + 1;
          while (end < w && cells[rowBase + end] === targetCell) {
            end++;
          }
          ctx.fillRect(x, y, end - x, 1);
          x = end;
        }
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    elapsedSec: number,
    palette: PixelPalette,
    intensity: EffectIntensity,
  ): void {
    const mult = getIntensityMultiplier(intensity);
    const shift1 = Math.floor(elapsedSec * 4.5);
    const shift2 = Math.floor(elapsedSec * 2.8);
    const nextKey = `${w}|${h}|${intensity}|${palette.fogPrimary}|${palette.fogSecondary}|${shift1}|${shift2}`;

    const hasDomCanvas = typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined";

    if (nextKey !== this.key) {
      this.key = nextKey;
      const total = w * h;
      if (this.cells.length !== total) {
        this.cells = new Uint8Array(total);
      } else {
        this.cells.fill(0);
      }
      if (this.rowMask.length !== h) {
        this.rowMask = new Uint8Array(h);
      } else {
        this.rowMask.fill(0);
      }

      const waveSec = shift1 / 4.5;
      const topInv = 1 / (h * 0.34);
      const botInv = 1 / (h * 0.28);
      for (let y = 0; y < h; y++) {
        const topNorm = Math.max(0, 1 - y * topInv);
        const botNorm = Math.max(0, 1 - (h - 1 - y) * botInv);
        const wave = 0.5 + 0.5 * Math.sin(y * 0.18 + waveSec * 0.6);
        const density = Math.min(0.75, (topNorm * 0.45 + botNorm * 0.42 + wave * 0.08) * mult);
        if (density <= 0.04) continue;

        const rowShift = y % 2 === 0 ? shift1 : -shift2;
        const rowBase = y * w;
        const rowPhase = y * 0.12;
        const bayerRow = (y & 3) * 4;
        let rMask = 0;
        for (let x = 0; x < w; x++) {
          const sx = x + rowShift;
          const lutIdx = ((sx * 0.07 + rowPhase) * SIN_TWO_PI_INV) & 1023;
          const mod = 0.7 + 0.3 * SIN_LUT[lutIdx];
          if (density * mod > BAYER_FLAT[bayerRow + (sx & 3)]) {
            const cell = (y + x) % 3 === 0 ? 2 : 1;
            this.cells[rowBase + x] = cell;
            rMask |= cell;
          }
        }
        this.rowMask[y] = rMask;
      }

      if (hasDomCanvas) {
        if (!this.canvas) {
          this.canvas = document.createElement("canvas");
        }
        if (this.canvas.width !== w || this.canvas.height !== h) {
          this.canvas.width = w;
          this.canvas.height = h;
          this.imageData = null;
        }
        if (!this.ctx) {
          this.ctx = this.canvas.getContext("2d");
        }
        if (this.ctx) {
          if (
            typeof this.ctx.createImageData === "function" &&
            typeof this.ctx.putImageData === "function"
          ) {
            if (
              !this.imageData ||
              this.imageData.width !== w ||
              this.imageData.height !== h
            ) {
              this.imageData = this.ctx.createImageData(w, h);
            }
            const data = this.imageData.data;
            const [r1, g1, b1] = parseHexRgb(palette.fogPrimary) ?? [156, 176, 201];
            const [r2, g2, b2] = parseHexRgb(palette.fogSecondary) ?? [156, 176, 201];
            if (IS_LITTLE_ENDIAN && data.buffer) {
              const u32 = new Uint32Array(data.buffer, data.byteOffset, total);
              const c1 = (255 << 24) | (b1 << 16) | (g1 << 8) | r1;
              const c2 = (255 << 24) | (b2 << 16) | (g2 << 8) | r2;
              const cells = this.cells;
              for (let i = 0; i < total; i++) {
                const cell = cells[i];
                u32[i] = cell === 1 ? c1 : cell === 2 ? c2 : 0;
              }
            } else {
              for (let i = 0; i < total; i++) {
                const cell = this.cells[i];
                const offset = i * 4;
                if (cell === 1) {
                  data[offset] = r1;
                  data[offset + 1] = g1;
                  data[offset + 2] = b1;
                  data[offset + 3] = 255;
                } else if (cell === 2) {
                  data[offset] = r2;
                  data[offset + 1] = g2;
                  data[offset + 2] = b2;
                  data[offset + 3] = 255;
                } else if (data[offset + 3] !== 0) {
                  data[offset + 3] = 0;
                }
              }
            }
            this.ctx.putImageData(this.imageData, 0, 0);
          } else {
            this.ctx.clearRect(0, 0, w, h);
            this.renderSpans(this.ctx, w, h, palette);
          }
        }
      }
    }

    if (hasDomCanvas && this.canvas && this.ctx) {
      ctx.drawImage(this.canvas, 0, 0);
      return;
    }

    this.renderSpans(ctx, w, h, palette);
  }
}
