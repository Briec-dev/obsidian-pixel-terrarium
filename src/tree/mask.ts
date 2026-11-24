import { bayerThreshold } from "../pixel-sprites";
import { lerp } from "../shared/math";
import type { Season, TreeSkeleton, TreeSpecies } from "../types";
import type { Palette } from "./palette";

export interface FoliageSpan {
  dx: number;
  dy: number;
  len: number;
  shade: 0 | 1 | 2;
}

const FOLIAGE_SPAN_CACHE = new Map<string, readonly FoliageSpan[]>();

export function getFoliageSpans(r: number, isPine: boolean): readonly FoliageSpan[] {
  const key = `${r}|${isPine ? 1 : 0}`;
  const cached = FOLIAGE_SPAN_CACHE.get(key);
  if (cached) return cached;

  const byShade: [FoliageSpan[], FoliageSpan[], FoliageSpan[]] = [[], [], []];
  for (let dy = -r; dy <= r; dy++) {
    const shade: 0 | 1 | 2 = dy < -r * 0.25 ? 2 : dy > r * 0.25 ? 0 : 1;
    let spanStart: number | null = null;
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.hypot(dx, dy);
      const solid =
        dist <= r + 0.25 &&
        !(dist > r - 0.8 && (dx + dy) % 2 !== 0) &&
        !(isPine && dy < 0 && Math.abs(dx) > r - Math.abs(dy));
      if (solid) {
        if (spanStart === null) spanStart = dx;
      } else if (spanStart !== null) {
        byShade[shade].push({ dx: spanStart, dy, len: dx - spanStart, shade });
        spanStart = null;
      }
    }
    if (spanStart !== null) {
      byShade[shade].push({ dx: spanStart, dy, len: r + 1 - spanStart, shade });
    }
  }
  const spans = [...byShade[0], ...byShade[1], ...byShade[2]];
  FOLIAGE_SPAN_CACHE.set(key, spans);
  return spans;
}

/**
 * Maintains the coarse pixel collision mask (`1` = bark, `2` = foliage),
 * rasterizing the tree into an optional offscreen canvas and computing snow cover.
 */
export class TreeCollisionMask {
  mask: Uint8Array = new Uint8Array(60 * 160);
  private snowScratch: Uint8Array = new Uint8Array(0);
  maskW = 60;
  maskH = 160;
  minX = 0;
  maxX = 59;
  minY = 0;
  maxY = 159;
  lastWidth = 180;
  lastHeight = 480;
  builtInStep = false;
  hasFreshMask = false;
  cacheKey = "";

  getBoundingBox(pixelScale: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.maxX < this.minX || this.maxY < this.minY) {
      return null;
    }
    return {
      minX: this.minX * pixelScale,
      minY: this.minY * pixelScale,
      maxX: Math.min(this.lastWidth, (this.maxX + 1) * pixelScale),
      maxY: Math.min(this.lastHeight, (this.maxY + 1) * pixelScale),
    };
  }

  isReady(width: number, height: number): boolean {
    return (
      this.hasFreshMask &&
      this.lastWidth === Math.max(1, width) &&
      this.lastHeight === Math.max(1, height) &&
      this.maskW > 0 &&
      this.maskH > 0 &&
      this.mask.length === this.maskW * this.maskH
    );
  }

  buildCacheKey(
    width: number,
    height: number,
    skeleton: TreeSkeleton,
    species: TreeSpecies,
    season: Season,
  ): string {
    return `${skeleton.seed ?? ""}|${skeleton.growthStep ?? skeleton.maturity.toFixed(4)}|${skeleton.branches.length}|${Math.round(skeleton.trunkBaseX)}|${species}|${season === "winter" ? 1 : 0}|${Math.max(1, width)}|${Math.max(1, height)}`;
  }

  prepare(width: number, height: number, pixelScale: number): { pw: number; ph: number } {
    this.lastWidth = Math.max(1, width);
    this.lastHeight = Math.max(1, height);
    const pw = Math.max(32, Math.floor(width / pixelScale));
    const ph = Math.max(48, Math.floor(height / pixelScale));

    if (this.maskW !== pw || this.maskH !== ph || this.mask.length !== pw * ph) {
      this.maskW = pw;
      this.maskH = ph;
      this.mask = new Uint8Array(pw * ph);
    } else {
      this.mask.fill(0);
    }
    this.minX = pw;
    this.maxX = -1;
    this.minY = ph;
    this.maxY = -1;
    return { pw, ph };
  }

  private markSpan(y: number, x0: number, x1: number, val: number): void {
    this.mask.fill(val, y * this.maskW + x0, y * this.maskW + x1);
    if (x0 < this.minX) this.minX = x0;
    if (x1 - 1 > this.maxX) this.maxX = x1 - 1;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  private markRect(x: number, y: number, w: number, h: number, val: number): void {
    const x0 = Math.max(0, x);
    const x1 = Math.min(this.maskW, x + w);
    const y0 = Math.max(0, y);
    const y1 = Math.min(this.maskH, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    if (x0 < this.minX) this.minX = x0;
    if (x1 - 1 > this.maxX) this.maxX = x1 - 1;
    if (y0 < this.minY) this.minY = y0;
    if (y1 - 1 > this.maxY) this.maxY = y1 - 1;
    for (let py = y0; py < y1; py++) {
      this.mask.fill(val, py * this.maskW + x0, py * this.maskW + x1);
    }
  }

  private rasterizeLine(
    ctx: CanvasRenderingContext2D | null,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r0: number,
    r1: number,
    color: string | null,
    writeMask: boolean,
  ): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    if (ctx && color) {
      ctx.fillStyle = color;
    }
    const pw = this.maskW;
    const ph = this.maskH;
    let prevX = Number.NaN;
    let prevY = Number.NaN;
    let prevR = Number.NaN;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(lerp(x0, x1, t));
      const y = Math.round(lerp(y0, y1, t));
      const r = Math.max(1, Math.round(lerp(r0, r1, t)));
      if (x === prevX && y === prevY && r === prevR) continue;
      prevX = x;
      prevY = y;
      prevR = r;
      const rx = x - Math.floor(r / 2);
      const ry = y - Math.floor(r / 2);
      const cx0 = Math.max(0, rx);
      const cy0 = Math.max(0, ry);
      const cx1 = Math.min(pw, rx + r);
      const cy1 = Math.min(ph, ry + r);
      if (cx1 <= cx0 || cy1 <= cy0) continue;
      if (ctx) {
        ctx.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
      }
      if (writeMask) {
        if (cx0 < this.minX) this.minX = cx0;
        if (cx1 - 1 > this.maxX) this.maxX = cx1 - 1;
        if (cy0 < this.minY) this.minY = cy0;
        if (cy1 - 1 > this.maxY) this.maxY = cy1 - 1;
        for (let py = cy0; py < cy1; py++) {
          this.mask.fill(1, py * pw + cx0, py * pw + cx1);
        }
      }
    }
  }

  /**
   * Draws tree bark + foliage into `pctx` (if supplied) and/or populates `mask` (if `writeMask`).
   */
  rasterizeStructure(
    pctx: CanvasRenderingContext2D | null,
    skeleton: TreeSkeleton,
    offsets: Map<string, number>,
    species: TreeSpecies,
    season: Season,
    palette: Palette | null,
    snowCover: number,
    pixelScale: number,
    writeMask: boolean,
  ): void {
    const pw = this.maskW;
    const ph = this.maskH;

    // 1. Pixel branches & trunk
    for (const b of skeleton.branches) {
      const off1 = b.parentId ? (offsets.get(b.parentId) ?? 0) : 0;
      const off2 = offsets.get(b.id) ?? 0;
      const x1 = Math.round((b.x1 + off1) / pixelScale);
      const y1 = Math.round(b.y1 / pixelScale);
      const x2 = Math.round((b.x2 + off2) / pixelScale);
      const y2 = Math.round(b.y2 / pixelScale);
      const color = palette
        ? b.isTrunk || b.depth <= 1 ? palette.barkDark : palette.barkLight
        : null;

      this.rasterizeLine(
        pctx,
        x1,
        y1,
        x2,
        y2,
        Math.max(1, Math.round(b.thicknessStart / pixelScale)),
        Math.max(1, Math.round(b.thicknessEnd / pixelScale)),
        color,
        writeMask,
      );
    }

    // 2. Pixel foliage clusters
    if (skeleton.stage === "sprout" && skeleton.branches.length > 0) {
      const tip = skeleton.branches[skeleton.branches.length - 1];
      const ox = Math.round((tip.x2 + (offsets.get(tip.id) ?? 0)) / pixelScale);
      const oy = Math.round(tip.y2 / pixelScale);
      if (pctx && palette) {
        pctx.fillStyle = palette.foliage[1];
      }
      if (ox - 3 >= 0 && ox - 1 <= pw && oy - 1 >= 0 && oy + 1 <= ph) {
        if (pctx) pctx.fillRect(ox - 3, oy - 1, 2, 2);
        if (writeMask) this.markRect(ox - 3, oy - 1, 2, 2, 2);
      }
      if (ox + 1 >= 0 && ox + 3 <= pw && oy - 1 >= 0 && oy + 1 <= ph) {
        if (pctx) pctx.fillRect(ox + 1, oy - 1, 2, 2);
        if (writeMask) this.markRect(ox + 1, oy - 1, 2, 2, 2);
      }
    } else if (!(season === "winter" && species !== "pine")) {
      const isPine = species === "pine";
      let lastFill = "";
      for (const b of skeleton.branches) {
        if (!b.hasFoliage) continue;

        const ox = Math.round((b.x2 + (offsets.get(b.id) ?? 0)) / pixelScale);
        const oy = Math.round(b.y2 / pixelScale);
        const r = Math.max(2, Math.round(b.foliageRadius / pixelScale));
        const spans = getFoliageSpans(r, isPine);

        for (let i = 0; i < spans.length; i++) {
          const span = spans[i];
          const py = oy + span.dy;
          if (py < 0 || py >= ph) continue;
          const x0 = Math.max(0, ox + span.dx);
          const x1 = Math.min(pw, ox + span.dx + span.len);
          if (x1 <= x0) continue;
          if (pctx && palette) {
            const shadeColor = palette.foliage[span.shade];
            if (shadeColor !== lastFill) {
              pctx.fillStyle = shadeColor;
              lastFill = shadeColor;
            }
            pctx.fillRect(x0, py, x1 - x0, 1);
          }
          if (writeMask) {
            this.markSpan(py, x0, x1, 2);
          }
        }

        if (pctx && palette?.blossom && snowCover < 0.6) {
          if (palette.blossom !== lastFill) {
            pctx.fillStyle = palette.blossom;
            lastFill = palette.blossom;
          }
          if (ox >= 0 && ox < pw && oy - 1 >= 0 && oy - 1 < ph) {
            pctx.fillRect(ox, oy - 1, 1, 1);
          }
          if (ox - 1 >= 0 && ox - 1 < pw && oy + 1 >= 0 && oy + 1 < ph) {
            pctx.fillRect(ox - 1, oy + 1, 1, 1);
          }
        }
      }
    }
  }

  rebuild(
    width: number,
    height: number,
    skeleton: TreeSkeleton,
    offsets: Map<string, number>,
    species: TreeSpecies,
    season: Season,
    pixelScale: number,
  ): void {
    this.prepare(width, height, pixelScale);
    this.rasterizeStructure(null, skeleton, offsets, species, season, null, 0, pixelScale, true);
    this.cacheKey = this.buildCacheKey(width, height, skeleton, species, season);
    this.hasFreshMask = true;
  }

  renderSnowAccumulation(
    pctx: CanvasRenderingContext2D,
    pw: number,
    ph: number,
    snowCover: number,
    isLight: boolean,
  ): void {
    if (this.maxX < this.minX || this.maxY < this.minY) return;

    const snowTop = isLight ? "#f8fcff" : "#ffffff";
    const snowRim = isLight ? "#cde4fa" : "#cfe6ff";
    const depthMax = snowCover > 0.7 ? 3 : snowCover > 0.35 ? 2 : 1;

    const total = pw * ph;
    if (this.snowScratch.length !== total) {
      this.snowScratch = new Uint8Array(total);
    }
    const scratch = this.snowScratch;
    const mask = this.mask;

    const yMin = Math.max(0, this.minY);
    const yMax = Math.min(ph - 1, this.maxY);
    const xMin = Math.max(0, this.minX);
    const xMax = Math.min(pw - 1, this.maxX);
    const clearY0 = Math.max(0, yMin - 1);
    const clearY1 = Math.min(ph - 1, yMax + depthMax);
    scratch.fill(0, clearY0 * pw, (clearY1 + 1) * pw);

    for (let y = yMin; y <= yMax; y++) {
      const rowBase = y * pw;
      const aboveBase = (y - 1) * pw;
      for (let x = xMin; x <= xMax; x++) {
        const cell = mask[rowBase + x];
        if (cell === 0) continue;
        if (y > 0 && mask[aboveBase + x] !== 0) continue;

        const dither = bayerThreshold(x, y);
        if (cell === 1) {
          if (snowCover * 1.15 > dither) {
            scratch[rowBase + x] = 1;
            if (snowCover > 0.55 && y > 0 && snowCover - 0.35 > dither) {
              scratch[aboveBase + x] = 2;
            }
          }
        } else if (snowCover * 1.35 > dither) {
          scratch[rowBase + x] = 1;
          for (let d = 1; d < depthMax; d++) {
            const ny = y + d;
            if (ny < ph && mask[ny * pw + x] === 2) {
              if (snowCover * (1.1 - d * 0.28) > bayerThreshold(x + d, ny)) {
                scratch[ny * pw + x] = d === 1 ? 1 : 2;
              }
            }
          }
          if (snowCover > 0.6 && y > 0 && snowCover - 0.45 > dither) {
            scratch[aboveBase + x] = 1;
          }
        }
      }
    }

    for (const targetVal of [2, 1] as const) {
      pctx.fillStyle = targetVal === 1 ? snowTop : snowRim;
      for (let y = clearY0; y <= clearY1; y++) {
        const rowBase = y * pw;
        let x = xMin;
        while (x <= xMax) {
          if (scratch[rowBase + x] !== targetVal) {
            x++;
            continue;
          }
          let end = x + 1;
          while (end <= xMax && scratch[rowBase + end] === targetVal) {
            end++;
          }
          pctx.fillRect(x, y, end - x, 1);
          x = end;
        }
      }
    }
  }
}
