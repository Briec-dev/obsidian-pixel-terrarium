import {
  createInitialTreeState,
  DEFAULT_SETTINGS,
  DEFAULT_TREE_SETTINGS,
  MAX_TREE_DECORATIONS,
  MAX_TREE_LANTERNS,
  PARIS_DEFAULT_LOCATION,
  type CityLocation,
  type DecorationType,
  type EffectIntensity,
  type OverlaySide,
  type PixelWeatherData,
  type PlacedDecoration,
  type PluginLanguage,
  type RenderLayer,
  type SeasonOverride,
  type TargetScope,
  type TimeOfDayOverride,
  type TreeSettings,
  type TreeSpecies,
  type TreeState,
  type ViewModeScope,
  type VisitorFrequency,
  type WeatherCondition,
  type WeatherOverride,
  type WeatherSnapshot,
} from "../types";

const VALID_CONDITIONS: ReadonlySet<string> = new Set<WeatherCondition>([
  "clear-day",
  "clear-night",
  "partly-cloudy-day",
  "partly-cloudy-night",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "heavy-rain",
  "snow",
  "thunderstorm",
]);

const VALID_SIDES = new Set<OverlaySide>(["right", "left"]);
const VALID_SPECIES = new Set<TreeSpecies>(["oak", "sakura", "pine"]);
const VALID_SEASONS = new Set<SeasonOverride>([
  "auto",
  "spring",
  "summer",
  "autumn",
  "winter",
]);
const VALID_TIMES = new Set<TimeOfDayOverride>([
  "auto",
  "dawn",
  "day",
  "dusk",
  "night",
]);
const VALID_VISITOR_FREQ = new Set<VisitorFrequency>([
  "calm",
  "normal",
  "lively",
]);
const VALID_DECO_TYPES = new Set<DecorationType>(["lantern", "birdhouse"]);

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function isFinitePositive(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val > 0;
}

function isFiniteNonNegative(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val >= 0;
}

function trimNonEmpty(val: unknown): string | undefined {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeLocation(raw: unknown): CityLocation {
  if (!raw || typeof raw !== "object") {
    return { ...PARIS_DEFAULT_LOCATION };
  }
  const obj = raw as Record<string, unknown>;
  const name = trimNonEmpty(obj.name);
  const validLat =
    typeof obj.latitude === "number" &&
    Number.isFinite(obj.latitude) &&
    obj.latitude >= -90 &&
    obj.latitude <= 90;
  const validLon =
    typeof obj.longitude === "number" &&
    Number.isFinite(obj.longitude) &&
    obj.longitude >= -180 &&
    obj.longitude <= 180;

  if (!name || !validLat || !validLon) {
    return { ...PARIS_DEFAULT_LOCATION };
  }

  return {
    name,
    country: typeof obj.country === "string" ? obj.country.trim() : "",
    admin1: trimNonEmpty(obj.admin1),
    latitude: obj.latitude as number,
    longitude: obj.longitude as number,
    timezone: trimNonEmpty(obj.timezone),
  };
}

function sanitizeWeatherSnapshot(raw: unknown): WeatherSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.condition !== "string" || !VALID_CONDITIONS.has(obj.condition)) {
    return null;
  }
  if (typeof obj.temperatureC !== "number" || !Number.isFinite(obj.temperatureC)) {
    return null;
  }
  const timezone = trimNonEmpty(obj.timezone);
  return {
    condition: obj.condition as WeatherCondition,
    wmoCode: typeof obj.wmoCode === "number" && Number.isFinite(obj.wmoCode) ? obj.wmoCode : 0,
    isDay: typeof obj.isDay === "boolean" ? obj.isDay : true,
    temperatureC: obj.temperatureC,
    windSpeedKmh: isFiniteNonNegative(obj.windSpeedKmh) ? obj.windSpeedKmh : 0,
    precipitationMm: isFiniteNonNegative(obj.precipitationMm) ? obj.precipitationMm : 0,
    cloudCoverPct: clampNumber(obj.cloudCoverPct, 0, 100, 0),
    fetchedAtMs: isFinitePositive(obj.fetchedAtMs) ? obj.fetchedAtMs : 0,
    locationName: trimNonEmpty(obj.locationName) ?? PARIS_DEFAULT_LOCATION.name,
    ...(timezone ? { timezone } : {}),
  };
}

export function sanitizeTreeSettings(raw: unknown): TreeSettings {
  const settings: TreeSettings = { ...DEFAULT_TREE_SETTINGS };
  if (!raw || typeof raw !== "object") return settings;

  const rs = raw as Record<string, unknown>;
  if (typeof rs.visible === "boolean") {
    settings.visible = rs.visible;
  }
  if (typeof rs.overlaySide === "string" && VALID_SIDES.has(rs.overlaySide as OverlaySide)) {
    settings.overlaySide = rs.overlaySide as OverlaySide;
  }
  if (typeof rs.overlayWidth === "number" && Number.isFinite(rs.overlayWidth)) {
    settings.overlayWidth = clampNumber(
      Math.round(rs.overlayWidth),
      140,
      360,
      DEFAULT_TREE_SETTINGS.overlayWidth,
    );
  }
  if (typeof rs.overlayOpacity === "number" && Number.isFinite(rs.overlayOpacity)) {
    settings.overlayOpacity = clampNumber(
      rs.overlayOpacity,
      0.3,
      1.0,
      DEFAULT_TREE_SETTINGS.overlayOpacity,
    );
  }
  if (typeof rs.species === "string" && VALID_SPECIES.has(rs.species as TreeSpecies)) {
    settings.species = rs.species as TreeSpecies;
  }
  if (typeof rs.seasonOverride === "string" && VALID_SEASONS.has(rs.seasonOverride as SeasonOverride)) {
    settings.seasonOverride = rs.seasonOverride as SeasonOverride;
  }
  if (typeof rs.timeOfDayOverride === "string" && VALID_TIMES.has(rs.timeOfDayOverride as TimeOfDayOverride)) {
    settings.timeOfDayOverride = rs.timeOfDayOverride as TimeOfDayOverride;
  }
  if (isFinitePositive(rs.growthSpeedMultiplier)) {
    settings.growthSpeedMultiplier = clampNumber(
      rs.growthSpeedMultiplier,
      0.2,
      100,
      DEFAULT_TREE_SETTINGS.growthSpeedMultiplier,
    );
  }
  if (
    typeof rs.visitorFrequency === "string" &&
    VALID_VISITOR_FREQ.has(rs.visitorFrequency as VisitorFrequency)
  ) {
    settings.visitorFrequency = rs.visitorFrequency as VisitorFrequency;
  }
  if (typeof rs.showSoilInfo === "boolean") {
    settings.showSoilInfo = rs.showSoilInfo;
  }
  return settings;
}

export function sanitizeTreeState(raw: unknown, now = Date.now()): TreeState {
  const state = createInitialTreeState(now);
  if (!raw || typeof raw !== "object") return state;

  const st = raw as Record<string, unknown>;
  if (typeof st.seed === "number" && Number.isFinite(st.seed) && Math.floor(st.seed) >= 1) {
    state.seed = Math.floor(st.seed);
  }
  if (typeof st.growthHours === "number" && Number.isFinite(st.growthHours)) {
    state.growthHours = Math.max(0.3, st.growthHours);
  }
  if (isFiniteNonNegative(st.activeSeconds)) {
    state.activeSeconds = Math.floor(st.activeSeconds);
  }
  if (isFiniteNonNegative(st.editBoostCount)) {
    state.editBoostCount = Math.floor(st.editBoostCount);
  }
  if (typeof st.moisture === "number" && Number.isFinite(st.moisture)) {
    state.moisture = clampNumber(st.moisture, 10, 100, state.moisture);
  }
  if (isFinitePositive(st.lastTickAt)) {
    state.lastTickAt = st.lastTickAt;
  }
  if (isFiniteNonNegative(st.waterBoostUntil)) {
    state.waterBoostUntil = st.waterBoostUntil;
  }
  if (isFinitePositive(st.plantedAt)) {
    state.plantedAt = st.plantedAt;
  }
  if (isFiniteNonNegative(st.timesWatered)) {
    state.timesWatered = Math.floor(st.timesWatered);
  }
  if (isFiniteNonNegative(st.visitorInteractions)) {
    state.visitorInteractions = Math.floor(st.visitorInteractions);
  }
  if (Array.isArray(st.decorations)) {
    const validDecos: PlacedDecoration[] = [];
    let lanternCount = 0;
    for (const item of st.decorations) {
      if (validDecos.length >= MAX_TREE_DECORATIONS) break;
      if (!item || typeof item !== "object") continue;
      const d = item as Record<string, unknown>;
      if (typeof d.id !== "string" || d.id.length === 0) continue;
      if (typeof d.type !== "string" || !VALID_DECO_TYPES.has(d.type as DecorationType)) {
        continue;
      }
      if (typeof d.normX !== "number" || !Number.isFinite(d.normX)) continue;
      if (typeof d.normY !== "number" || !Number.isFinite(d.normY)) continue;
      if (d.type === "lantern") {
        if (lanternCount >= MAX_TREE_LANTERNS) continue;
        lanternCount++;
      }
      const deco: PlacedDecoration = {
        id: d.id,
        type: d.type as DecorationType,
        normX: clampNumber(d.normX, 0, 1, 0.5),
        normY: clampNumber(d.normY, 0, 1, 0.5),
      };
      if (typeof d.branchId === "string" && d.branchId.length > 0) {
        deco.branchId = d.branchId;
      }
      if (typeof d.branchT === "number" && Number.isFinite(d.branchT)) {
        deco.branchT = clampNumber(d.branchT, 0, 1, 0.5);
      }
      validDecos.push(deco);
    }
    state.decorations = validDecos;
  }
  return state;
}

export function sanitizePluginData(raw: unknown, now = Date.now()): PixelWeatherData {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawSettings = obj.settings && typeof obj.settings === "object"
    ? (obj.settings as Record<string, unknown>)
    : {};

  const language: PluginLanguage =
    rawSettings.language === "auto" ||
    rawSettings.language === "fr" ||
    rawSettings.language === "en"
      ? rawSettings.language
      : DEFAULT_SETTINGS.language;
  const weatherOverride: WeatherOverride =
    typeof rawSettings.weatherOverride === "string" &&
    (rawSettings.weatherOverride === "auto" || VALID_CONDITIONS.has(rawSettings.weatherOverride))
      ? (rawSettings.weatherOverride as WeatherOverride)
      : DEFAULT_SETTINGS.weatherOverride;

  const intensity: EffectIntensity =
    rawSettings.intensity === "subtle" ||
    rawSettings.intensity === "normal" ||
    rawSettings.intensity === "intense"
      ? rawSettings.intensity
      : DEFAULT_SETTINGS.intensity;

  const targetScope: TargetScope =
    rawSettings.targetScope === "active" || rawSettings.targetScope === "all"
      ? rawSettings.targetScope
      : DEFAULT_SETTINGS.targetScope;

  const viewModeScope: ViewModeScope =
    rawSettings.viewModeScope === "editing-only" || rawSettings.viewModeScope === "all-markdown"
      ? rawSettings.viewModeScope
      : DEFAULT_SETTINGS.viewModeScope;

  const renderLayer: RenderLayer =
    rawSettings.renderLayer === "above" || rawSettings.renderLayer === "below"
      ? rawSettings.renderLayer
      : DEFAULT_SETTINGS.renderLayer;

  const blockedConditions: WeatherCondition[] = [];
  if (Array.isArray(rawSettings.blockedConditions)) {
    const seen = new Set<string>();
    for (const item of rawSettings.blockedConditions) {
      if (typeof item === "string" && VALID_CONDITIONS.has(item) && !seen.has(item)) {
        seen.add(item);
        blockedConditions.push(item as WeatherCondition);
      }
    }
  }

  return {
    settings: {
      enabled: typeof rawSettings.enabled === "boolean" ? rawSettings.enabled : DEFAULT_SETTINGS.enabled,
      language,
      location: sanitizeLocation(rawSettings.location),
      weatherOverride,
      blockedConditions,
      pixelSize: Math.round(clampNumber(rawSettings.pixelSize, 2, 8, DEFAULT_SETTINGS.pixelSize)),
      intensity,
      opacity: clampNumber(rawSettings.opacity, 0.1, 1.0, DEFAULT_SETTINGS.opacity),
      targetScope,
      viewModeScope,
      renderLayer,
      showCloudsAndCelestial:
        typeof rawSettings.showCloudsAndCelestial === "boolean"
          ? rawSettings.showCloudsAndCelestial
          : DEFAULT_SETTINGS.showCloudsAndCelestial,
      showGroundAccumulation:
        typeof rawSettings.showGroundAccumulation === "boolean"
          ? rawSettings.showGroundAccumulation
          : DEFAULT_SETTINGS.showGroundAccumulation,
      reactToTyping:
        typeof rawSettings.reactToTyping === "boolean"
          ? rawSettings.reactToTyping
          : DEFAULT_SETTINGS.reactToTyping,
      refreshIntervalMinutes: Math.round(
        clampNumber(rawSettings.refreshIntervalMinutes, 5, 120, DEFAULT_SETTINGS.refreshIntervalMinutes),
      ),
      treeWeatherInteractions:
        typeof rawSettings.treeWeatherInteractions === "boolean"
          ? rawSettings.treeWeatherInteractions
          : DEFAULT_SETTINGS.treeWeatherInteractions,
      tree: sanitizeTreeSettings(rawSettings.tree),
    },
    lastWeather: sanitizeWeatherSnapshot(obj.lastWeather),
    treeState: sanitizeTreeState(obj.treeState, now),
  };
}
