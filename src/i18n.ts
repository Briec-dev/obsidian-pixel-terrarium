import { getLanguage, moment } from "obsidian";
import { EN } from "./i18n/en";
import { FR } from "./i18n/fr";
import type { Translations } from "./i18n/types";
import type {
  PluginLanguage,
  ResolvedLanguage,
  Season,
  TimeOfDay,
  TreeSpecies,
  TreeStage,
  WeatherCondition,
  WeatherOverride,
} from "./types";

export type { Translations };

export function detectObsidianLanguage(): ResolvedLanguage {
  const raw =
    typeof getLanguage === "function"
      ? getLanguage()
      : typeof moment?.locale === "function"
        ? moment.locale()
        : "";
  const norm = String(raw || "").toLowerCase().trim();
  return norm === "fr" || norm.startsWith("fr-") || norm.startsWith("fr_") ? "fr" : "en";
}

export function resolveLanguage(lang: PluginLanguage): ResolvedLanguage {
  if (lang === "auto") {
    return detectObsidianLanguage();
  }
  return lang;
}

export function getTranslations(lang: PluginLanguage): Translations {
  return resolveLanguage(lang) === "fr" ? FR : EN;
}

export function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`,
  );
}

export function getOverrideConditionList(): WeatherCondition[] {
  return [
    "clear-day",
    "partly-cloudy-day",
    "cloudy",
    "fog",
    "drizzle",
    "rain",
    "heavy-rain",
    "thunderstorm",
    "snow",
    "clear-night",
    "partly-cloudy-night",
  ];
}

export function getConditionLabel(lang: PluginLanguage, condition: WeatherCondition): string {
  return getTranslations(lang).conditions[condition];
}

export function getConditionIconGlyph(condition: WeatherCondition): string {
  switch (condition) {
    case "clear-day":
      return "☀";
    case "clear-night":
      return "☾";
    case "partly-cloudy-day":
      return "⛅";
    case "partly-cloudy-night":
      return "☁";
    case "cloudy":
      return "☁";
    case "fog":
      return "▒";
    case "drizzle":
      return "☂";
    case "rain":
    case "heavy-rain":
      return "☔";
    case "snow":
      return "❄";
    case "thunderstorm":
      return "⚡";
  }
}

export function getOverrideLabel(lang: PluginLanguage, override: WeatherOverride): string {
  if (override === "auto") return getTranslations(lang).settings.overrideAuto;
  return getConditionLabel(lang, override);
}

export function getStageLabel(lang: PluginLanguage, stage: TreeStage): string {
  return getTranslations(lang).tree.stages[stage];
}

export function getSeasonLabel(lang: PluginLanguage, season: Season): string {
  return getTranslations(lang).tree.seasons[season];
}

export function getTimeLabel(lang: PluginLanguage, time: TimeOfDay): string {
  return getTranslations(lang).tree.timesOfDay[time];
}

export function getSpeciesLabel(lang: PluginLanguage, species: TreeSpecies): string {
  return getTranslations(lang).tree.species[species];
}
