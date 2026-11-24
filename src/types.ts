export type WeatherCondition =
  | "clear-day"
  | "clear-night"
  | "partly-cloudy-day"
  | "partly-cloudy-night"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "snow"
  | "thunderstorm";

export type WeatherOverride = "auto" | WeatherCondition;

export type EffectIntensity = "subtle" | "normal" | "intense";

export type TargetScope = "active" | "all";

export type ViewModeScope = "editing-only" | "all-markdown";

export type RenderLayer = "above" | "below";

export type ResolvedLanguage = "fr" | "en";
export type PluginLanguage = "auto" | ResolvedLanguage;

export type OverlaySide = "right" | "left";
export type TreeSpecies = "oak" | "sakura" | "pine";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type SeasonOverride = "auto" | Season;
export type TimeOfDay = "dawn" | "day" | "dusk" | "night";
export type TimeOfDayOverride = "auto" | TimeOfDay;
export type VisitorFrequency = "calm" | "normal" | "lively";

export type TreeStage =
  | "sprout"
  | "seedling"
  | "sapling"
  | "young"
  | "mature"
  | "ancient";

export type DecorationType = "lantern" | "birdhouse";

export const MAX_TREE_LANTERNS = 15;
export const MAX_TREE_DECORATIONS = 20;

export interface PlacedDecoration {
  id: string;
  type: DecorationType;
  /** Normalized X in [0..1] across the widget width */
  normX: number;
  /** Normalized Y in [0..1] from top (0) to bottom (1) */
  normY: number;
  /** Optional branch anchor ID so decorations grow & stay attached to their branch */
  branchId?: string;
  /** Optional normalized position t in [0..1] along the anchored branch */
  branchT?: number;
}

export interface CityLocation {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface WeatherSnapshot {
  condition: WeatherCondition;
  wmoCode: number;
  isDay: boolean;
  temperatureC: number;
  windSpeedKmh: number;
  precipitationMm: number;
  cloudCoverPct: number;
  fetchedAtMs: number;
  locationName: string;
  timezone?: string;
}

export interface TreeSettings {
  visible: boolean;
  overlaySide: OverlaySide;
  overlayWidth: number;
  overlayOpacity: number;
  species: TreeSpecies;
  seasonOverride: SeasonOverride;
  timeOfDayOverride: TimeOfDayOverride;
  growthSpeedMultiplier: number;
  visitorFrequency: VisitorFrequency;
  showSoilInfo: boolean;
}

export interface TreeState {
  seed: number;
  /** Accumulated effective growth hours (passive time + gentle writing & water boosts) */
  growthHours: number;
  /** Total active seconds Obsidian was open with this plugin */
  activeSeconds: number;
  /** Total estimated edits/words contributed */
  editBoostCount: number;
  /** Current hydration 0..100 */
  moisture: number;
  /** Timestamp (ms) of last moisture/tick update */
  lastTickAt: number;
  /** Timestamp (ms) until which watering boost applies */
  waterBoostUntil: number;
  /** Timestamp (ms) when tree was planted */
  plantedAt: number;
  /** Decorations placed anywhere on the tree */
  decorations: PlacedDecoration[];
  /** Number of times user watered the tree */
  timesWatered: number;
  /** Number of friendly visitor interactions */
  visitorInteractions: number;
}

export interface BranchNode {
  id: string;
  parentId: string | null;
  depth: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thicknessStart: number;
  thicknessEnd: number;
  angle: number;
  length: number;
  hasFoliage: boolean;
  foliageRadius: number;
  isTrunk: boolean;
}

export interface TreeSkeleton {
  seed?: number;
  growthStep?: number;
  stage: TreeStage;
  /** Normalized maturity 0..1+ (1.0 around mature, grows gently past 1.0 forever) */
  maturity: number;
  heightFraction: number;
  branches: BranchNode[];
  trunkBaseX: number;
  groundY: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface PixelWeatherSettings {
  enabled: boolean;
  language: PluginLanguage;
  location: CityLocation;
  weatherOverride: WeatherOverride;
  blockedConditions: WeatherCondition[];
  pixelSize: number;
  intensity: EffectIntensity;
  opacity: number;
  targetScope: TargetScope;
  viewModeScope: ViewModeScope;
  renderLayer: RenderLayer;
  showCloudsAndCelestial: boolean;
  showGroundAccumulation: boolean;
  reactToTyping: boolean;
  refreshIntervalMinutes: number;
  treeWeatherInteractions: boolean;
  tree: TreeSettings;
}

export interface PixelWeatherData {
  settings: PixelWeatherSettings;
  lastWeather: WeatherSnapshot | null;
  treeState: TreeState;
}

export const PARIS_DEFAULT_LOCATION: CityLocation = {
  name: "Paris",
  country: "France",
  admin1: "Île-de-France",
  latitude: 48.8566,
  longitude: 2.3522,
  timezone: "Europe/Paris",
};

export const DEFAULT_TREE_SETTINGS: TreeSettings = {
  visible: true,
  overlaySide: "right",
  overlayWidth: 200,
  overlayOpacity: 0.9,
  species: "oak",
  seasonOverride: "auto",
  timeOfDayOverride: "auto",
  growthSpeedMultiplier: 1,
  visitorFrequency: "normal",
  showSoilInfo: true,
};

export const DEFAULT_SETTINGS: PixelWeatherSettings = {
  enabled: true,
  language: "auto",
  location: { ...PARIS_DEFAULT_LOCATION },
  weatherOverride: "auto",
  blockedConditions: [],
  pixelSize: 4,
  intensity: "subtle",
  opacity: 0.5,
  targetScope: "all",
  viewModeScope: "all-markdown",
  renderLayer: "below",
  showCloudsAndCelestial: true,
  showGroundAccumulation: true,
  reactToTyping: true,
  refreshIntervalMinutes: 30,
  treeWeatherInteractions: true,
  tree: { ...DEFAULT_TREE_SETTINGS },
};

export function createInitialTreeState(now = Date.now()): TreeState {
  return {
    seed: Math.floor(Math.random() * 1_000_000) + 1,
    growthHours: 0.3,
    activeSeconds: 0,
    editBoostCount: 0,
    moisture: 85,
    lastTickAt: now,
    waterBoostUntil: 0,
    plantedAt: now,
    decorations: [],
    timesWatered: 0,
    visitorInteractions: 0,
  };
}

export { sanitizePluginData, sanitizeTreeSettings, sanitizeTreeState } from "./shared/sanitize";
