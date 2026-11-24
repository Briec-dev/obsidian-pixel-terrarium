import { bayerThreshold } from "./pixel-sprites";
import { applyAmbientLight, lerpHexColor } from "./shared/color";
import { clamp } from "./shared/math";
import {
  drawLanternAmbientGlow,
  drawPixelDecoration,
  hitTestDecoration,
  LanternGlowCache,
} from "./tree/decorations";
import { TreeCollisionMask } from "./tree/mask";
import {
  DEFAULT_TREE_WEATHER,
  getPalette,
  LitPaletteCache,
  type Palette,
  type TreeWeatherInput,
} from "./tree/palette";
import {
  countParticles,
  emitFallbackRainImpacts,
  emitSeasonalParticles,
  type Particle,
  type ParticleKind,
  pushParticle,
  renderParticles,
  spawnRainImpactParticles,
  spawnReactionBurstParticles,
  spawnShakeBurstParticles,
  spawnSnowFrostParticle,
  spawnWaterSplashParticles,
  stepParticles,
} from "./tree/particles";
import { isRainyCondition } from "./tree/time-season";
import {
  type ActiveVisitor,
  disturbVisitorsList,
  hitTestVisitor,
  interactWithVisitor,
  renderVisitors,
  stepVisitors,
  type VisitorKind,
  type VisitorNodePools,
} from "./tree/visitors";
import {
  createWateringCanAnim,
  renderWateringCan,
  stepWateringCanAnim,
  type WateringCanAnimState,
} from "./tree/watering-can";
import type {
  BranchNode,
  DecorationType,
  PlacedDecoration,
  Season,
  TimeOfDay,
  TreeSkeleton,
  TreeSpecies,
  VisitorFrequency,
} from "./types";

export {
  applyAmbientLight,
  DEFAULT_TREE_WEATHER,
  getPalette,
  hitTestDecoration,
  lerpHexColor,
  type ActiveVisitor,
  type Palette,
  type Particle,
  type ParticleKind,
  type TreeWeatherInput,
  type VisitorKind,
  type WateringCanAnimState,
};

export interface RenderContextData {
  skeleton: TreeSkeleton;
  species: TreeSpecies;
  season: Season;
  timeOfDay: TimeOfDay;
  weather: TreeWeatherInput;
  decorations: PlacedDecoration[];
  placingDecoration: DecorationType | null;
  pointerPos: { x: number; y: number } | null;
  isLightTheme?: boolean;
}

export class TreeSimulation {
  private static readonly PIXEL_SCALE = 3;

  private particles: Particle[] = [];
  private visitors: ActiveVisitor[] = [];
  private nextVisitorId = 1;
  private nextVisitorSpawnAt = 0;
  private windTime = 0;
  private windStrength = 1.0;
  private windBias = 0;
  private shakeAmplitude = 0;
  private shakeVelocity = 0;
  private snowCover = 0;
  private offscreenPixelCanvas: HTMLCanvasElement | null = null;

  private collisionMask = new TreeCollisionMask();
  private lanternGlowCache = new LanternGlowCache();
  private litPaletteCache = new LitPaletteCache();

  private wateringCanAnim: WateringCanAnimState | null = null;
  private wateringDropAccum = 0;

  private cachedSkeletonRef: TreeSkeleton | null = null;
  private cachedBranchIdSet = new Set<string>();
  private lastSkeletonHeightFraction = 0;
  private cachedFoliageNodes: BranchNode[] = [];
  private cachedPerchNodes: BranchNode[] = [];
  private cachedUpperPerchNodes: BranchNode[] = [];
  private cachedTrunkNodes: BranchNode[] = [];
  private cachedClimbNodes: BranchNode[] = [];

  private cachedDecorationsRef: PlacedDecoration[] | null = null;
  private cachedBirdhouses: PlacedDecoration[] = [];
  private cachedLanterns: PlacedDecoration[] = [];

  private branchOffsets = new Map<string, number>();

  constructor() {
    this.nextVisitorSpawnAt = Date.now() + 5000;
  }

  getSnowCover(): number {
    return this.snowCover;
  }

  setSnowCoverForTest(value: number): void {
    this.snowCover = clamp(value, 0, 1);
  }

  getParticleCount(kind?: ParticleKind): number {
    return countParticles(this.particles, kind);
  }

  getCollisionMask(): { mask: Uint8Array; maskW: number; maskH: number } {
    return {
      mask: this.collisionMask.mask,
      maskW: this.collisionMask.maskW,
      maskH: this.collisionMask.maskH,
    };
  }

  getMaskBoundingBox(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    return this.collisionMask.getBoundingBox(TreeSimulation.PIXEL_SCALE);
  }

  hasMaskReady(width: number, height: number): boolean {
    return this.collisionMask.isReady(width, height);
  }

  private needsCollisionMask(weather: TreeWeatherInput): boolean {
    if (this.snowCover > 0.04) return true;
    if (!weather.enabled || !weather.interactionsEnabled) return false;
    return (
      isRainyCondition(weather.condition) ||
      weather.condition === "snow" ||
      weather.condition === "fog"
    );
  }

  /**
   * Ensures solidMask reflects the current skeleton even if collision checks
   * run before the first render() frame, caching across frames until tree/size/season changes.
   */
  rebuildCollisionMask(
    width: number,
    height: number,
    skeleton: TreeSkeleton,
    species: TreeSpecies,
    season: Season,
  ): void {
    this.collisionMask.rebuild(
      width,
      height,
      skeleton,
      new Map<string, number>(),
      species,
      season,
      TreeSimulation.PIXEL_SCALE,
    );
  }

  private ensureSkeletonCaches(skeleton: TreeSkeleton): void {
    if (this.cachedSkeletonRef === skeleton) return;
    this.cachedSkeletonRef = skeleton;
    this.cachedBranchIdSet.clear();
    this.cachedFoliageNodes = [];
    this.cachedPerchNodes = [];
    this.cachedUpperPerchNodes = [];
    this.cachedTrunkNodes = [];
    this.cachedClimbNodes = [];

    for (const b of skeleton.branches) {
      this.cachedBranchIdSet.add(b.id);
      if (b.hasFoliage) {
        this.cachedFoliageNodes.push(b);
      }
      if (b.isTrunk) {
        this.cachedTrunkNodes.push(b);
        this.cachedClimbNodes.push(b);
      } else if (b.depth <= 3) {
        this.cachedPerchNodes.push(b);
        this.cachedClimbNodes.push(b);
        if (b.depth >= 2) {
          this.cachedUpperPerchNodes.push(b);
        }
      }
    }
  }

  private ensureDecorationCaches(decorations: PlacedDecoration[]): void {
    if (this.cachedDecorationsRef === decorations) return;
    this.cachedDecorationsRef = decorations;
    this.cachedBirdhouses = [];
    this.cachedLanterns = [];
    for (const d of decorations) {
      if (d.type === "birdhouse") {
        this.cachedBirdhouses.push(d);
      } else if (d.type === "lantern") {
        this.cachedLanterns.push(d);
      }
    }
  }

  triggerShake(strength = 1.0): void {
    this.shakeAmplitude = clamp(this.shakeAmplitude + strength * 0.9, 0, 2.2);
  }

  /**
   * Called when a raindrop collides with the tree canopy or bark.
   */
  spawnRainImpactSplash(normX: number, normY: number, windVx = 0): void {
    const x = clamp(normX, 0, 1) * this.collisionMask.lastWidth;
    const y = clamp(normY, 0, 1) * this.collisionMask.lastHeight;
    const windBias = clamp(windVx * 0.35, -24, 24);
    spawnRainImpactParticles(this.particles, x, y, windBias);

    // Very subtle branch micro-quiver from rain impact
    if (this.shakeAmplitude < 0.22) {
      this.shakeAmplitude = Math.min(0.24, this.shakeAmplitude + 0.02);
    }
  }

  /**
   * Called when a snowflake lands on the tree canopy or branches.
   */
  onSnowImpact(normX: number, normY: number): void {
    this.snowCover = clamp(this.snowCover + 0.0022, 0, 1);
    spawnSnowFrostParticle(
      this.particles,
      normX,
      normY,
      this.collisionMask.lastWidth,
      this.collisionMask.lastHeight,
    );
  }

  triggerWateringCan(skeleton: TreeSkeleton): void {
    this.wateringCanAnim = createWateringCanAnim(skeleton, this.collisionMask.lastWidth);
    this.wateringDropAccum = 0;
  }

  getWateringCanState(): WateringCanAnimState | null {
    return this.wateringCanAnim ? { ...this.wateringCanAnim } : null;
  }

  spawnWaterSplash(x: number, y: number): void {
    spawnWaterSplashParticles(this.particles, x, y);
  }

  spawnShakeBurst(skeleton: TreeSkeleton, season: Season, species: TreeSpecies): void {
    this.ensureSkeletonCaches(skeleton);
    const isSnowy = this.snowCover > 0.22 || season === "winter";
    if (this.snowCover > 0.15) {
      this.snowCover = Math.max(0, this.snowCover - 0.18);
    }
    spawnShakeBurstParticles(
      this.particles,
      skeleton,
      this.cachedFoliageNodes,
      season,
      species,
      isSnowy,
      this.windBias,
    );
  }

  spawnReactionBurst(x: number, y: number, kind: "heart" | "note" | "sparkle"): void {
    spawnReactionBurstParticles(this.particles, x, y, kind);
  }

  hitTestVisitor(x: number, y: number): ActiveVisitor | null {
    return hitTestVisitor(this.visitors, x, y);
  }

  interactVisitor(visitor: ActiveVisitor, now = Date.now()): void {
    interactWithVisitor(visitor, now, {
      spawnReactionBurst: (x, y, kind) => this.spawnReactionBurst(x, y, kind),
      triggerShake: (strength) => this.triggerShake(strength),
    });
  }

  disturbVisitors(now = Date.now()): void {
    disturbVisitorsList(this.visitors, now);
  }

  step(
    dtSeconds: number,
    width: number,
    height: number,
    skeleton: TreeSkeleton,
    species: TreeSpecies,
    season: Season,
    timeOfDay: TimeOfDay,
    weather: TreeWeatherInput,
    visitorFrequency: VisitorFrequency,
    decorations: PlacedDecoration[],
    now = Date.now(),
  ): void {
    const dt = clamp(dtSeconds, 0.001, 0.1);
    const activeWeather = weather.enabled && weather.interactionsEnabled;

    if (activeWeather) {
      this.windStrength = clamp(0.65 + (weather.windSpeedKmh / 14) * 1.15, 0.65, 3.6);
      this.windBias = clamp((weather.windSpeedKmh - 12) / 28, 0, 1.4);
    } else {
      this.windStrength = 1.0;
      this.windBias = 0;
    }
    this.windTime += dt * (0.9 + (this.windStrength - 1) * 0.35);

    if (this.shakeAmplitude > 0.001) {
      this.shakeAmplitude = Math.max(0, this.shakeAmplitude - dt * 1.15);
      this.shakeVelocity = Math.sin(this.windTime * 22) * this.shakeAmplitude;
    } else {
      this.shakeAmplitude = 0;
      this.shakeVelocity = 0;
    }

    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    const dimsChanged =
      this.collisionMask.lastWidth !== safeW || this.collisionMask.lastHeight !== safeH;
    this.collisionMask.lastWidth = safeW;
    this.collisionMask.lastHeight = safeH;
    this.ensureSkeletonCaches(skeleton);
    this.ensureDecorationCaches(decorations);

    if (this.needsCollisionMask(weather)) {
      const maskKey = this.collisionMask.buildCacheKey(width, height, skeleton, species, season);
      if (
        this.collisionMask.cacheKey !== maskKey ||
        dimsChanged ||
        this.collisionMask.mask.length !== this.collisionMask.maskW * this.collisionMask.maskH
      ) {
        this.rebuildCollisionMask(width, height, skeleton, species, season);
      } else {
        this.collisionMask.hasFreshMask = true;
      }
      this.collisionMask.builtInStep = true;
    } else {
      this.collisionMask.builtInStep = false;
      this.collisionMask.hasFreshMask = false;
    }

    if (this.wateringCanAnim) {
      const res = stepWateringCanAnim(
        this.wateringCanAnim,
        dt,
        skeleton,
        this.wateringDropAccum,
        {
          spawnWaterDrop: (x, y, vx, vy, color) => {
            pushParticle(this.particles, {
              kind: "water",
              x,
              y,
              vx,
              vy,
              size: 2,
              life: 0,
              maxLife: 0.55 + Math.random() * 0.25,
              color,
              phase: 0,
            });
          },
          spawnSplash: (x, y) => {
            pushParticle(this.particles, {
              kind: "rain-splash",
              x,
              y,
              vx: (Math.random() - 0.5) * 28,
              vy: -16 - Math.random() * 16,
              size: 2,
              life: 0,
              maxLife: 0.24 + Math.random() * 0.12,
              color: "#a8dcff",
              phase: 0,
            });
          },
          onPourShake: (stepDt) => {
            if (this.shakeAmplitude < 0.2) {
              this.shakeAmplitude = Math.min(0.22, this.shakeAmplitude + stepDt * 0.4);
            }
          },
        },
      );
      this.wateringDropAccum = res.dropAccum;
      if (!res.active) {
        this.wateringCanAnim = null;
      }
    }

    this.stepSnowCover(dt, weather);
    emitFallbackRainImpacts(
      dt,
      weather,
      this.collisionMask.mask,
      this.collisionMask.maskW,
      this.collisionMask.maskH,
      (normX, normY, windVx) => this.spawnRainImpactSplash(normX, normY, windVx),
    );
    emitSeasonalParticles(
      this.particles,
      dt,
      skeleton,
      this.cachedFoliageNodes,
      species,
      season,
      timeOfDay,
      weather,
      this.snowCover,
      this.windBias,
    );
    stepParticles(this.particles, dt, skeleton.groundY, this.windTime, this.windBias);

    const pools: VisitorNodePools = {
      branchIdSet: this.cachedBranchIdSet,
      foliageNodes: this.cachedFoliageNodes,
      perchNodes: this.cachedPerchNodes,
      upperPerchNodes: this.cachedUpperPerchNodes,
      trunkNodes: this.cachedTrunkNodes,
      climbNodes: this.cachedClimbNodes,
      birdhouses: this.cachedBirdhouses,
      lanterns: this.cachedLanterns,
    };
    const visitorResult = stepVisitors(
      this.visitors,
      dt,
      width,
      height,
      skeleton,
      season,
      timeOfDay,
      weather,
      visitorFrequency,
      pools,
      this.lastSkeletonHeightFraction,
      this.nextVisitorSpawnAt,
      () => this.nextVisitorId++,
      {
        pushParticle: (p) => pushParticle(this.particles, p),
        spawnReactionBurst: (x, y, kind) => this.spawnReactionBurst(x, y, kind),
        spawnShakeBurst: () => this.spawnShakeBurst(skeleton, season, species),
      },
      now,
    );
    this.lastSkeletonHeightFraction = visitorResult.lastHeightFraction;
    this.nextVisitorSpawnAt = visitorResult.nextSpawnAt;
  }

  private stepSnowCover(dt: number, weather: TreeWeatherInput): void {
    const active = weather.enabled && weather.interactionsEnabled;
    if (active && weather.condition === "snow") {
      const intensityMult =
        weather.intensity === "subtle"
          ? 0.65
          : weather.intensity === "intense"
            ? 1.55
            : 1.0;
      this.snowCover = clamp(this.snowCover + dt * 0.038 * intensityMult, 0, 1);
      return;
    }

    if (this.snowCover > 0) {
      let meltRate = 0.025;
      if (!active) {
        meltRate = 0.14;
      } else if (isRainyCondition(weather.condition)) {
        meltRate = 0.095;
      } else if (weather.condition === "clear-day") {
        meltRate = 0.055;
      }
      this.snowCover = Math.max(0, this.snowCover - dt * meltRate);
    }
  }

  private getWindOffset(branch: BranchNode): number {
    if (branch.isTrunk && branch.id === "t0") return 0;
    const heightFactor = (branch.depth + 0.4) * 0.65;
    const sway = Math.sin(this.windTime * 0.65 + branch.y2 * 0.02) * 0.45 * this.windStrength;
    const lean = this.windBias * 0.4;
    const shake = this.shakeVelocity * 2.2;
    return (sway + lean + shake) * heightFactor;
  }

  computeBranchOffsets(skeleton: TreeSkeleton): Map<string, number> {
    this.branchOffsets.clear();
    for (const b of skeleton.branches) {
      this.branchOffsets.set(b.id, this.getWindOffset(b));
    }
    return this.branchOffsets;
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: RenderContextData,
  ): void {
    const isLight = Boolean(data.isLightTheme);
    const palette = this.litPaletteCache.get(
      data.species,
      data.season,
      data.timeOfDay,
      data.weather,
      this.snowCover,
      isLight,
    );
    const pixelScale = TreeSimulation.PIXEL_SCALE;
    const pw = Math.max(32, Math.floor(width / pixelScale));
    const ph = Math.max(48, Math.floor(height / pixelScale));

    const { skeleton } = data;
    const needsMask = this.needsCollisionMask(data.weather);
    const maskKey = needsMask
      ? this.collisionMask.buildCacheKey(width, height, skeleton, data.species, data.season)
      : "";
    const populateMaskInRender =
      needsMask &&
      (!this.collisionMask.builtInStep ||
        this.collisionMask.maskW !== pw ||
        this.collisionMask.maskH !== ph ||
        this.collisionMask.cacheKey !== maskKey);
    this.collisionMask.builtInStep = false;

    if (populateMaskInRender) {
      this.collisionMask.prepare(width, height, pixelScale);
      this.collisionMask.hasFreshMask = true;
    }

    if (!this.offscreenPixelCanvas) {
      const doc = ctx.canvas?.ownerDocument;
      this.offscreenPixelCanvas = doc ? doc.createElement("canvas") : createEl("canvas");
    }
    const off = this.offscreenPixelCanvas;
    if (off.width !== pw || off.height !== ph) {
      off.width = pw;
      off.height = ph;
    }
    const pctx = off.getContext("2d");
    if (!pctx) return;

    pctx.clearRect(0, 0, pw, ph);
    pctx.imageSmoothingEnabled = false;

    const offsets = this.computeBranchOffsets(skeleton);

    if (populateMaskInRender) {
      this.collisionMask.rasterizeStructure(
        pctx,
        skeleton,
        offsets,
        data.species,
        data.season,
        palette,
        this.snowCover,
        pixelScale,
        true,
      );
      this.collisionMask.cacheKey = maskKey;
    } else {
      const savedW = this.collisionMask.maskW;
      const savedH = this.collisionMask.maskH;
      this.collisionMask.maskW = pw;
      this.collisionMask.maskH = ph;
      this.collisionMask.rasterizeStructure(
        pctx,
        skeleton,
        offsets,
        data.species,
        data.season,
        palette,
        this.snowCover,
        pixelScale,
        false,
      );
      this.collisionMask.maskW = savedW;
      this.collisionMask.maskH = savedH;
    }

    if (this.snowCover > 0.04) {
      this.collisionMask.renderSnowAccumulation(pctx, pw, ph, this.snowCover, isLight);
    }

    for (const deco of data.decorations) {
      const ax = Math.round((deco.normX * width) / pixelScale);
      const ay = Math.round((deco.normY * height) / pixelScale);
      drawPixelDecoration(
        pctx,
        this.lanternGlowCache,
        deco.type,
        ax,
        ay,
        pw,
        ph,
        data.timeOfDay,
        this.windTime,
        this.windStrength,
        this.snowCover,
        isLight,
        false,
      );
    }

    if (data.placingDecoration && data.pointerPos) {
      const gx = Math.round(data.pointerPos.x / pixelScale);
      const gy = Math.round(data.pointerPos.y / pixelScale);
      drawPixelDecoration(
        pctx,
        this.lanternGlowCache,
        data.placingDecoration,
        gx,
        gy,
        pw,
        ph,
        data.timeOfDay,
        this.windTime,
        this.windStrength,
        this.snowCover,
        isLight,
        true,
      );
    }

    renderVisitors(pctx, this.visitors, pixelScale, isLight);
    renderParticles(pctx, this.particles, pixelScale, pw, ph, isLight);

    if (this.wateringCanAnim) {
      renderWateringCan(pctx, this.wateringCanAnim, pixelScale, pw, ph, isLight);
    }

    if (
      data.weather.enabled &&
      data.weather.interactionsEnabled &&
      data.weather.condition === "fog" &&
      this.collisionMask.maskW === pw &&
      this.collisionMask.maskH === ph
    ) {
      pctx.fillStyle = isLight ? "rgba(148, 163, 184, 0.35)" : "rgba(156, 176, 201, 0.32)";
      const shift = Math.floor(this.windTime * 2);
      const mask = this.collisionMask.mask;
      for (let y = Math.floor(ph * 0.55); y < ph; y++) {
        const density = ((y - ph * 0.55) / (ph * 0.45)) * 0.45;
        for (let x = 0; x < pw; x++) {
          if (mask[y * pw + x] > 0 && density > bayerThreshold(x + shift, y)) {
            pctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, width, height);

    for (const deco of data.decorations) {
      if (deco.type !== "lantern") continue;
      drawLanternAmbientGlow(
        ctx,
        this.lanternGlowCache,
        this.windTime,
        deco.normX * width,
        deco.normY * height + 3,
        data.timeOfDay,
        isLight,
        false,
      );
    }
    if (data.placingDecoration === "lantern" && data.pointerPos) {
      drawLanternAmbientGlow(
        ctx,
        this.lanternGlowCache,
        this.windTime,
        data.pointerPos.x,
        data.pointerPos.y + 3,
        data.timeOfDay,
        isLight,
        true,
      );
    }
  }
}
