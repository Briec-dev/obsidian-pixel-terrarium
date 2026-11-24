import { getPixelPalette } from "./pixel-sprites";
import type { EffectIntensity, WeatherCondition } from "./types";
import {
  type AmbientMote,
  type BirdEntity,
  type CloudEntity,
  type LightningBolt,
  renderBirdsAndMotes,
  renderCelestial,
  renderClouds,
  renderLightning,
  renderStars,
  reseedClouds,
  spawnLightningBolt,
  type StarEntity,
  stepBirdsAndMotes,
  stepClouds,
  syncStarsToGrid,
} from "./weather/atmosphere";
import {
  buildTreeCollisionTarget,
  type TreeColliderBounds,
  type TreeCollisionTarget,
} from "./weather/collision";
import {
  getMaxSnowHeight,
  type Raindrop,
  renderRain,
  renderSnow,
  renderSnowGround,
  renderSplashes,
  resizeSnowHeight,
  type Snowflake,
  type Splash,
  stepRain,
  stepSnow,
  stepSplashes,
} from "./weather/precipitation";
import {
  FogRenderer,
  getIntensityMultiplier,
  SunbeamRenderer,
} from "./weather/sky-effects";

export {
  buildTreeCollisionTarget,
  getIntensityMultiplier,
  type TreeColliderBounds,
  type TreeCollisionTarget,
};

export interface RenderOptions {
  condition: WeatherCondition;
  intensity: EffectIntensity;
  windSpeedKmh: number;
  showCloudsAndCelestial: boolean;
  showGroundAccumulation: boolean;
  isDarkTheme: boolean;
  treeCollider?: TreeCollisionTarget | null;
}

export class PixelWeatherSimulation {
  width = 160;
  height = 100;
  elapsedSec = 0;

  private raindrops: Raindrop[] = [];
  private splashes: Splash[] = [];
  private snowflakes: Snowflake[] = [];
  private clouds: CloudEntity[] = [];
  private starPool: StarEntity[] = [];
  private stars: StarEntity[] = [];
  private birds: BirdEntity[] = [];
  private motes: AmbientMote[] = [];
  private snowHeight: Float32Array = new Float32Array(160);
  private lightning: LightningBolt | null = null;
  private lightningCooldownSec = 3.5;
  private flashAlpha = 0;
  private typingGustRemainingSec = 0;

  private lastCondition: WeatherCondition | null = null;
  private fogRenderer = new FogRenderer();
  private sunbeamRenderer = new SunbeamRenderer();

  get fogCanvas(): HTMLCanvasElement | null {
    return this.fogRenderer.canvas;
  }

  get fogCells(): Uint8Array {
    return this.fogRenderer.cells;
  }

  constructor(private rng: () => number = Math.random) {
    syncStarsToGrid(this.starPool, this.stars, this.width, this.height, this.rng);
    this.clouds = reseedClouds("partly-cloudy-day", this.width, this.rng);
  }

  setGridSize(width: number, height: number): void {
    const nextW = Math.max(40, Math.floor(width));
    const nextH = Math.max(30, Math.floor(height));
    if (nextW === this.width && nextH === this.height) return;

    this.snowHeight = resizeSnowHeight(this.snowHeight, nextW);
    this.width = nextW;
    this.height = nextH;
    this.fogRenderer.invalidate();
    this.sunbeamRenderer.invalidate();
    syncStarsToGrid(this.starPool, this.stars, this.width, this.height, this.rng);
  }

  triggerTypingImpulse(): void {
    this.typingGustRemainingSec = 0.85;
  }

  getFlashAlpha(): number {
    return this.flashAlpha;
  }

  getEffectiveWindSpeedKmh(baseWindSpeedKmh: number): number {
    const gustBonus = this.typingGustRemainingSec > 0 ? 12 : 0;
    return Math.min(60, Math.max(0, baseWindSpeedKmh) + gustBonus);
  }

  getParticleCounts(): {
    raindrops: number;
    splashes: number;
    snowflakes: number;
    clouds: number;
    stars: number;
    hasLightning: boolean;
  } {
    return {
      raindrops: this.raindrops.length,
      splashes: this.splashes.length,
      snowflakes: this.snowflakes.length,
      clouds: this.clouds.length,
      stars: this.stars.length,
      hasLightning: this.lightning !== null,
    };
  }

  getMaxSnowHeight(): number {
    return getMaxSnowHeight(this.snowHeight);
  }

  step(dtSec: number, options: RenderOptions): void {
    const dt = Math.min(0.1, Math.max(0.001, dtSec));
    this.elapsedSec += dt;
    if (this.typingGustRemainingSec > 0) {
      this.typingGustRemainingSec = Math.max(0, this.typingGustRemainingSec - dt);
    }

    const {
      condition,
      intensity,
      windSpeedKmh,
      showCloudsAndCelestial,
      showGroundAccumulation,
      treeCollider,
    } = options;

    if (this.lastCondition !== condition) {
      this.onConditionChanged(condition);
      this.lastCondition = condition;
    }

    const mult = getIntensityMultiplier(intensity);
    const effectiveWind = this.getEffectiveWindSpeedKmh(windSpeedKmh);
    const windPxPerSec = (effectiveWind / 25) * 18;

    stepClouds(
      this.clouds,
      dt,
      this.width,
      condition,
      mult,
      windPxPerSec,
      showCloudsAndCelestial,
      this.rng,
    );
    stepRain(
      this.raindrops,
      this.splashes,
      dt,
      this.width,
      this.height,
      condition,
      mult,
      windPxPerSec,
      showGroundAccumulation,
      treeCollider ?? null,
      this.rng,
    );
    stepSplashes(this.splashes, dt);
    stepSnow(
      this.snowflakes,
      this.snowHeight,
      dt,
      this.width,
      this.height,
      condition,
      mult,
      windPxPerSec,
      showGroundAccumulation,
      treeCollider ?? null,
      this.rng,
    );
    this.stepLightning(dt, condition);
    stepBirdsAndMotes(
      this.birds,
      this.motes,
      dt,
      this.width,
      this.height,
      condition,
      mult,
      this.rng,
    );
  }

  render(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const palette = getPixelPalette(options.isDarkTheme, options.condition);

    // Subtle atmospheric tint
    if (palette.skyTint !== "rgba(0, 0, 0, 0)") {
      ctx.fillStyle = palette.skyTint;
      ctx.fillRect(0, 0, w, h);
    }

    // Lightning flash overlay
    if (this.flashAlpha > 0.01) {
      ctx.fillStyle = options.isDarkTheme
        ? `rgba(235, 244, 255, ${(this.flashAlpha * 0.28).toFixed(3)})`
        : `rgba(255, 250, 210, ${(this.flashAlpha * 0.25).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Night stars
    if (
      options.showCloudsAndCelestial &&
      (options.condition === "clear-night" || options.condition === "partly-cloudy-night")
    ) {
      renderStars(ctx, this.stars, this.elapsedSec, palette);
    }

    // Sunbeams (under clouds)
    if (
      options.condition === "clear-day" ||
      options.condition === "partly-cloudy-day"
    ) {
      this.sunbeamRenderer.render(
        ctx,
        w,
        h,
        this.elapsedSec,
        palette,
        options.condition === "clear-day" ? 1 : 0.55,
      );
    }

    // Celestial body (sun / moon)
    if (options.showCloudsAndCelestial) {
      renderCelestial(ctx, w, this.elapsedSec, options.condition, palette);
    }

    // Fog bands (dithered pixel mist)
    if (options.condition === "fog") {
      this.fogRenderer.render(ctx, w, h, this.elapsedSec, palette, options.intensity);
    } else {
      this.fogRenderer.release();
    }

    // Pixel clouds
    if (options.showCloudsAndCelestial) {
      renderClouds(ctx, this.clouds, palette);
    }

    // Birds & ambient motes
    renderBirdsAndMotes(ctx, this.birds, this.motes, this.elapsedSec, options.condition, palette);

    // Lightning bolt
    if (this.lightning) {
      renderLightning(ctx, this.lightning, palette);
    }

    // Rain & splashes
    renderRain(ctx, this.raindrops, w, h, palette);
    if (options.showGroundAccumulation) {
      renderSplashes(ctx, this.splashes, w, palette);
    }

    // Snowflakes & snow ground accumulation
    renderSnow(ctx, this.snowflakes, palette);
    if (options.showGroundAccumulation) {
      renderSnowGround(ctx, this.snowHeight, w, h, palette);
    }
  }

  private onConditionChanged(next: WeatherCondition): void {
    this.clouds = reseedClouds(next, this.width, this.rng);
    if (next !== "fog") {
      this.fogRenderer.release();
    }
    if (next !== "thunderstorm") {
      this.lightning = null;
      this.flashAlpha = 0;
    }
  }

  private stepLightning(dt: number, condition: WeatherCondition): void {
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3.6);
    }

    if (this.lightning) {
      this.lightning.age += dt;
      if (this.lightning.age >= this.lightning.maxAge) {
        this.lightning = null;
      }
    }

    if (condition !== "thunderstorm") return;

    this.lightningCooldownSec -= dt;
    if (this.lightningCooldownSec <= 0) {
      this.lightning = spawnLightningBolt(this.width, this.height, this.rng);
      this.flashAlpha = 1;
      this.lightningCooldownSec = 3.2 + this.rng() * 5.5;
    }
  }
}
