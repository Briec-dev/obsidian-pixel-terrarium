import { applyAmbientLight, lerpHexColor } from "../shared/color";
import { clamp } from "../shared/math";
import type {
  EffectIntensity,
  Season,
  TimeOfDay,
  TreeSpecies,
  WeatherCondition,
} from "../types";

export interface Palette {
  barkDark: string;
  barkLight: string;
  foliage: [string, string, string];
  blossom: string | null;
  ambientLight: number;
}

export interface TreeWeatherInput {
  enabled: boolean;
  interactionsEnabled: boolean;
  condition: WeatherCondition;
  intensity: EffectIntensity;
  windSpeedKmh: number;
  lightningFlash: number;
  hasExternalOverlap?: boolean;
}

export const DEFAULT_TREE_WEATHER: TreeWeatherInput = {
  enabled: false,
  interactionsEnabled: true,
  condition: "partly-cloudy-day",
  intensity: "normal",
  windSpeedKmh: 10,
  lightningFlash: 0,
  hasExternalOverlap: false,
};

const PALETTE_CACHE = new Map<TreeSpecies, Map<Season, Map<TimeOfDay, Palette>>>();

export function getPalette(
  species: TreeSpecies,
  season: Season,
  timeOfDay: TimeOfDay,
): Palette {
  let bySeason = PALETTE_CACHE.get(species);
  let byTime = bySeason?.get(season);
  const cached = byTime?.get(timeOfDay);
  if (cached) return cached;

  const barkDark =
    species === "sakura"
      ? "#4a3338"
      : species === "pine"
        ? "#4d3528"
        : "#563d2d";
  const barkLight =
    species === "sakura"
      ? "#6e4d53"
      : species === "pine"
        ? "#71503c"
        : "#785741";

  let foliage: [string, string, string];
  let blossom: string | null = null;

  if (species === "pine") {
    if (season === "spring") {
      foliage = ["#265336", "#357047", "#4c8f58"];
    } else if (season === "summer") {
      foliage = ["#1e462d", "#2c613e", "#3c7c50"];
    } else if (season === "autumn") {
      foliage = ["#244832", "#315b40", "#45704c"];
    } else {
      foliage = ["#203d32", "#2d5244", "#3d6958"];
    }
  } else if (species === "sakura") {
    if (season === "spring") {
      foliage = ["#d97aa0", "#f29ec0", "#ffd5e6"];
      blossom = "#fff0f6";
    } else if (season === "summer") {
      foliage = ["#376942", "#4c8a56", "#6aa96d"];
    } else if (season === "autumn") {
      foliage = ["#a84737", "#cf6a40", "#e69b4e"];
    } else {
      foliage = ["#6a5a63", "#83727b", "#9d8d96"];
    }
  } else {
    if (season === "spring") {
      foliage = ["#457c3b", "#63a14b", "#86c464"];
      blossom = "#f5f7dc";
    } else if (season === "summer") {
      foliage = ["#2b5e34", "#3d7c44", "#559b56"];
    } else if (season === "autumn") {
      foliage = ["#9f3d28", "#cc6b2c", "#e3a73b"];
    } else {
      foliage = ["#5b5652", "#706a65", "#8a837c"];
    }
  }

  let ambientLight = 1.0;
  if (timeOfDay === "dawn") ambientLight = 0.88;
  else if (timeOfDay === "dusk") ambientLight = 0.78;
  else if (timeOfDay === "night") ambientLight = 0.56;

  const palette: Palette = {
    barkDark,
    barkLight,
    foliage,
    blossom,
    ambientLight,
  };
  if (!bySeason) {
    bySeason = new Map();
    PALETTE_CACHE.set(species, bySeason);
  }
  if (!byTime) {
    byTime = new Map();
    bySeason.set(season, byTime);
  }
  byTime.set(timeOfDay, palette);
  return palette;
}

export class LitPaletteCache {
  private lastKey = "";
  private cached: Palette | null = null;

  get(
    species: TreeSpecies,
    season: Season,
    timeOfDay: TimeOfDay,
    weather: TreeWeatherInput,
    snowCover: number,
    isLightTheme: boolean,
  ): Palette {
    const snowStep = Math.round(snowCover * 32);
    const flashStep = weather.enabled && weather.interactionsEnabled
      ? Math.round(weather.lightningFlash * 10)
      : 0;
    const condKey = weather.enabled && weather.interactionsEnabled ? weather.condition : "none";
    const key = `${species}|${season}|${timeOfDay}|${condKey}|${snowStep}|${flashStep}|${isLightTheme ? 1 : 0}`;
    if (this.cached && this.lastKey === key) {
      return this.cached;
    }

    const base = getPalette(species, season, timeOfDay);
    let ambient = base.ambientLight;
    if (weather.enabled && weather.interactionsEnabled) {
      if (weather.condition === "cloudy" || weather.condition === "fog") {
        ambient *= 0.9;
      } else if (weather.condition === "drizzle" || weather.condition === "rain") {
        ambient *= 0.87;
      } else if (weather.condition === "heavy-rain" || weather.condition === "thunderstorm") {
        ambient *= 0.82;
      }
      if (weather.lightningFlash > 0.02) {
        ambient = Math.min(1.28, ambient + weather.lightningFlash * 0.45);
      }
    }

    let foliage: [string, string, string] = [
      applyAmbientLight(base.foliage[0], ambient),
      applyAmbientLight(base.foliage[1], ambient),
      applyAmbientLight(base.foliage[2], ambient),
    ];

    if (snowCover > 0.01) {
      const frostTargets: [string, string, string] = isLightTheme
        ? ["#bdd0e6", "#d8e8f8", "#f3f9ff"]
        : ["#c6daf0", "#e2f0ff", "#ffffff"];
      const frostBlend = clamp(snowCover * 0.72, 0, 0.78);
      foliage = [
        lerpHexColor(foliage[0], frostTargets[0], frostBlend * 0.75),
        lerpHexColor(foliage[1], frostTargets[1], frostBlend * 0.9),
        lerpHexColor(foliage[2], frostTargets[2], frostBlend),
      ];
    }

    const lit: Palette = {
      barkDark: applyAmbientLight(base.barkDark, ambient),
      barkLight: applyAmbientLight(base.barkLight, ambient),
      foliage,
      blossom: base.blossom
        ? applyAmbientLight(base.blossom, ambient)
        : null,
      ambientLight: ambient,
    };
    this.lastKey = key;
    this.cached = lit;
    return lit;
  }
}

export function getThemeParticleColor(
  kind: string,
  color: string,
  isLightTheme: boolean,
): string {
  if (!isLightTheme) return color;
  switch (kind) {
    case "rain-splash":
      return "#3b82f6";
    case "drip":
      return "#2563eb";
    case "frost":
      return "#e0f2fe";
    case "water":
      return "#2782db";
    case "snow":
      return "#8daed4";
    case "petal":
      return "#de6c9b";
    case "note":
      return "#c78610";
    case "sparkle":
      return color === "#d9ff78" ? "#77a612" : "#c78b18";
    default:
      return color;
  }
}
