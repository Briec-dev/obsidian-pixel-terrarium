import type {
  Season,
  SeasonOverride,
  TimeOfDay,
  TimeOfDayOverride,
  WeatherCondition,
} from "../types";

export function isRainyCondition(condition: WeatherCondition): boolean {
  return (
    condition === "drizzle" ||
    condition === "rain" ||
    condition === "heavy-rain" ||
    condition === "thunderstorm"
  );
}

const TIMEZONE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat | null>();

export function getCityLocalHour(
  date = new Date(),
  timezone?: string,
  longitude?: number,
): number {
  if (timezone && timezone !== "auto") {
    let formatter = TIMEZONE_FORMATTER_CACHE.get(timezone);
    if (formatter === undefined) {
      try {
        formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        });
      } catch {
        formatter = null;
      }
      TIMEZONE_FORMATTER_CACHE.set(timezone, formatter);
    }

    if (formatter) {
      try {
        const parts = formatter.formatToParts(date);
        let hour = 0;
        let minute = 0;
        for (const p of parts) {
          if (p.type === "hour") {
            hour = Number(p.value) % 24;
          } else if (p.type === "minute") {
            minute = Number(p.value);
          }
        }
        if (Number.isFinite(hour) && Number.isFinite(minute)) {
          return hour + minute / 60;
        }
      } catch {
        // Fall through to longitude / local fallback
      }
    }
  }

  if (typeof longitude === "number" && Number.isFinite(longitude)) {
    const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
    return (((utcHours + longitude / 15) % 24) + 24) % 24;
  }

  return date.getHours() + date.getMinutes() / 60;
}

export function resolveSeason(
  override: SeasonOverride,
  date = new Date(),
  latitude?: number,
): Season {
  if (override !== "auto") return override;
  const month = date.getMonth();
  const day = date.getDate();

  let season: Season;
  if (month === 11 || month === 0 || month === 1) {
    season = month === 11 && day < 21 ? "autumn" : "winter";
  } else if (month >= 2 && month <= 4) {
    season = month === 2 && day < 20 ? "winter" : "spring";
  } else if (month >= 5 && month <= 7) {
    season = month === 5 && day < 21 ? "spring" : "summer";
  } else {
    season = month === 8 && day < 22 ? "summer" : "autumn";
  }

  if (typeof latitude === "number" && Number.isFinite(latitude) && latitude < 0) {
    if (season === "spring") return "autumn";
    if (season === "autumn") return "spring";
    if (season === "summer") return "winter";
    return "summer";
  }

  return season;
}

/**
 * Resolves effective time of day for the tree.
 * When set to "auto", syncs with explicit night/day weather conditions
 * (e.g. previewing "clear-night" or "clear-day") before falling back to the city's clock.
 */
export function resolveTimeOfDay(
  override: TimeOfDayOverride,
  date = new Date(),
  weatherCondition?: WeatherCondition,
  weatherIsDay?: boolean,
  timezone?: string,
  longitude?: number,
): TimeOfDay {
  if (override !== "auto") return override;
  if (weatherCondition === "clear-night" || weatherCondition === "partly-cloudy-night") {
    return "night";
  }
  if (weatherCondition === "clear-day" || weatherCondition === "partly-cloudy-day") {
    const hour = getCityLocalHour(date, timezone, longitude);
    if (hour >= 5.5 && hour < 8.5) return "dawn";
    if (hour >= 17.5 && hour < 20.5) return "dusk";
    return "day";
  }
  if (weatherIsDay === false) {
    return "night";
  }
  const hour = getCityLocalHour(date, timezone, longitude);
  if (hour >= 5.5 && hour < 8.5) return "dawn";
  if (hour >= 8.5 && hour < 17.5) return "day";
  if (hour >= 17.5 && hour < 20.5) return "dusk";
  return "night";
}
