import type {
  CityLocation,
  ResolvedLanguage,
  WeatherCondition,
  WeatherSnapshot,
} from "./types";

export interface HttpJsonResponse {
  status: number;
  json: unknown;
}

export type HttpJsonClient = (url: string) => Promise<HttpJsonResponse>;

/**
 * Maps Open-Meteo / WMO weather interpretation codes (WW) + day/night flag
 * to our discrete pixel-art weather conditions.
 */
export function mapWmoCodeToCondition(wmoCode: number, isDay: boolean): WeatherCondition {
  const code = Math.round(wmoCode);

  if (code === 0) {
    return isDay ? "clear-day" : "clear-night";
  }
  if (code === 1 || code === 2) {
    return isDay ? "partly-cloudy-day" : "partly-cloudy-night";
  }
  if (code === 3) {
    return "cloudy";
  }
  if (code === 45 || code === 48) {
    return "fog";
  }
  if (code >= 51 && code <= 57) {
    return "drizzle";
  }
  if (code === 61 || code === 63 || code === 66 || code === 80 || code === 81) {
    return "rain";
  }
  if (code === 65 || code === 67 || code === 82) {
    return "heavy-rain";
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return "snow";
  }
  if (code === 95 || code === 96 || code === 99) {
    return "thunderstorm";
  }

  return isDay ? "partly-cloudy-day" : "partly-cloudy-night";
}

/**
 * Downgrades a blocked automatic weather condition to the nearest calmer unblocked weather.
 */
export function resolveUnblockedCondition(
  condition: WeatherCondition,
  blocked: readonly WeatherCondition[],
  isDay: boolean,
): WeatherCondition {
  if (blocked.length === 0 || !blocked.includes(condition)) {
    return condition;
  }

  const blockedSet = new Set(blocked);
  const calmTail: WeatherCondition[] = isDay
    ? ["cloudy", "partly-cloudy-day", "clear-day"]
    : ["cloudy", "partly-cloudy-night", "clear-night"];

  const chains: Record<WeatherCondition, WeatherCondition[]> = {
    thunderstorm: ["heavy-rain", "rain", "drizzle", ...calmTail],
    "heavy-rain": ["rain", "drizzle", ...calmTail],
    rain: ["drizzle", ...calmTail],
    drizzle: calmTail,
    snow: calmTail,
    fog: calmTail,
    cloudy: [
      isDay ? "partly-cloudy-day" : "partly-cloudy-night",
      isDay ? "clear-day" : "clear-night",
    ],
    "partly-cloudy-day": ["clear-day", "cloudy"],
    "partly-cloudy-night": ["clear-night", "cloudy"],
    "clear-day": ["partly-cloudy-day", "cloudy"],
    "clear-night": ["partly-cloudy-night", "cloudy"],
  };

  for (const candidate of chains[condition]) {
    if (!blockedSet.has(candidate)) {
      return candidate;
    }
  }

  const remaining: WeatherCondition[] = isDay
    ? [
        "partly-cloudy-night",
        "clear-night",
        "fog",
        "drizzle",
        "rain",
        "heavy-rain",
        "snow",
        "thunderstorm",
      ]
    : [
        "partly-cloudy-day",
        "clear-day",
        "fog",
        "drizzle",
        "rain",
        "heavy-rain",
        "snow",
        "thunderstorm",
      ];
  for (const candidate of remaining) {
    if (!blockedSet.has(candidate)) {
      return candidate;
    }
  }

  return isDay ? "clear-day" : "clear-night";
}

export function buildForecastUrl(location: CityLocation): string {
  const params = new URLSearchParams({
    latitude: location.latitude.toFixed(4),
    longitude: location.longitude.toFixed(4),
    current: "temperature_2m,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m",
    timezone: location.timezone || "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export function buildGeocodingUrl(cityQuery: string, lang: ResolvedLanguage): string {
  const params = new URLSearchParams({
    name: cityQuery.trim(),
    count: "5",
    language: lang,
    format: "json",
  });
  return `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
}

export function parseForecastResponse(
  payload: unknown,
  location: CityLocation,
  nowMs = Date.now(),
): WeatherSnapshot {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid forecast payload");
  }
  const root = payload as Record<string, unknown>;
  const current = root.current;
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    throw new Error("Missing or invalid current weather block");
  }
  const c = current as Record<string, unknown>;

  if (
    typeof c.temperature_2m !== "number" ||
    !Number.isFinite(c.temperature_2m) ||
    typeof c.weather_code !== "number" ||
    !Number.isFinite(c.weather_code)
  ) {
    throw new Error("Invalid or incomplete current weather block");
  }

  const temperatureC = c.temperature_2m;
  const wmoCode = c.weather_code;
  const isDay = c.is_day === 0 ? false : true;
  const windSpeedKmh = typeof c.wind_speed_10m === "number" && Number.isFinite(c.wind_speed_10m)
    ? Math.max(0, c.wind_speed_10m)
    : 0;
  const precipitationMm = typeof c.precipitation === "number" && Number.isFinite(c.precipitation)
    ? Math.max(0, c.precipitation)
    : 0;
  const cloudCoverPct = typeof c.cloud_cover === "number" && Number.isFinite(c.cloud_cover)
    ? Math.min(100, Math.max(0, c.cloud_cover))
    : 0;

  const timezone =
    typeof root.timezone === "string" && root.timezone.trim().length > 0
      ? root.timezone.trim()
      : location.timezone;

  return {
    condition: mapWmoCodeToCondition(wmoCode, isDay),
    wmoCode,
    isDay,
    temperatureC,
    windSpeedKmh,
    precipitationMm,
    cloudCoverPct,
    fetchedAtMs: nowMs,
    locationName: location.name,
    ...(timezone ? { timezone } : {}),
  };
}

export function parseGeocodingResponse(payload: unknown): CityLocation[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.results)) {
    return [];
  }

  const locations: CityLocation[] = [];
  for (const item of root.results) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (
      typeof obj.name !== "string" ||
      typeof obj.latitude !== "number" ||
      !Number.isFinite(obj.latitude) ||
      typeof obj.longitude !== "number" ||
      !Number.isFinite(obj.longitude)
    ) {
      continue;
    }
    locations.push({
      name: obj.name.trim(),
      country: typeof obj.country === "string" ? obj.country.trim() : "",
      admin1: typeof obj.admin1 === "string" && obj.admin1.trim().length > 0
        ? obj.admin1.trim()
        : undefined,
      latitude: obj.latitude,
      longitude: obj.longitude,
      timezone: typeof obj.timezone === "string" && obj.timezone.trim().length > 0
        ? obj.timezone.trim()
        : undefined,
    });
  }
  return locations;
}

export class WeatherService {
  constructor(
    private httpClient: HttpJsonClient,
    private timeoutMs = 10_000,
  ) {}

  private async fetchJsonWithTimeout(url: string): Promise<HttpJsonResponse> {
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      return this.httpClient(url);
    }

    let timerId: number | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = window.setTimeout(() => {
        reject(new Error(`Request timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([this.httpClient(url), timeoutPromise]);
    } finally {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    }
  }

  async fetchCurrentWeather(location: CityLocation): Promise<WeatherSnapshot> {
    const url = buildForecastUrl(location);
    const response = await this.fetchJsonWithTimeout(url);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }
    return parseForecastResponse(response.json, location, Date.now());
  }

  async searchCity(query: string, lang: ResolvedLanguage): Promise<CityLocation[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const url = buildGeocodingUrl(trimmed, lang);
    const response = await this.fetchJsonWithTimeout(url);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Open-Meteo geocoding HTTP ${response.status}`);
    }
    return parseGeocodingResponse(response.json);
  }
}
