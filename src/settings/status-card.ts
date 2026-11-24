import type { App } from "obsidian";
import {
  formatTemplate,
  getConditionIconGlyph,
  getConditionLabel,
  getTranslations,
} from "../i18n";
import type {
  CityLocation,
  PixelWeatherSettings,
  TreeSettings,
  TreeState,
  WeatherCondition,
  WeatherSnapshot,
} from "../types";

export interface SettingsHostPlugin {
  app: App;
  getSettings(): PixelWeatherSettings;
  getTreeState(): TreeState;
  getLastWeather(): WeatherSnapshot | null;
  getEffectiveCondition(): WeatherCondition;
  updateSettings(patch: Partial<PixelWeatherSettings>): Promise<void>;
  updateTreeSettings(patch: Partial<TreeSettings>): Promise<void>;
  refreshWeather(showNotice?: boolean): Promise<boolean>;
  searchCities(query: string): Promise<CityLocation[]>;
  selectLocation(location: CityLocation): Promise<void>;
  setTreeGrowthHours(hours: number): Promise<void>;
  clearTreeDecorations(): Promise<void>;
  resetTree(): Promise<void>;
}

export function formatLocationLabel(loc: CityLocation): string {
  const parts = [loc.name];
  if (loc.admin1 && loc.admin1 !== loc.name) parts.push(loc.admin1);
  if (loc.country) parts.push(loc.country);
  return parts.join(", ");
}

export function renderStatusCard(
  containerEl: HTMLElement,
  settings: PixelWeatherSettings,
  snapshot: WeatherSnapshot | null,
  effectiveCondition: WeatherCondition,
  onRefresh: () => Promise<void>,
): void {
  const t = getTranslations(settings.language);
  const card = containerEl.createDiv({ cls: "pixel-weather-status-card" });

  const left = card.createDiv({ cls: "pixel-weather-status-main" });
  const glyphEl = left.createDiv({ cls: "pixel-weather-status-glyph" });
  glyphEl.setText(getConditionIconGlyph(effectiveCondition));

  const info = left.createDiv({ cls: "pixel-weather-status-info" });
  const badgeText =
    settings.weatherOverride === "auto"
      ? t.settings.statusLiveLabel
      : t.settings.statusPreviewLabel;
  const titleRow = info.createDiv({ cls: "pixel-weather-status-title-row" });
  titleRow.createSpan({
    cls: "pixel-weather-status-city",
    text: `${settings.location.name} — ${getConditionLabel(settings.language, effectiveCondition)}`,
  });
  titleRow.createSpan({
    cls: `pixel-weather-status-badge ${settings.weatherOverride === "auto" ? "is-live" : "is-preview"}`,
    text: badgeText,
  });

  if (snapshot) {
    info.createDiv({
      cls: "pixel-weather-status-meta",
      text: formatTemplate(t.settings.statusTempWind, {
        temp: Math.round(snapshot.temperatureC),
        wind: Math.round(snapshot.windSpeedKmh),
        clouds: Math.round(snapshot.cloudCoverPct),
      }),
    });
    const timeStr = new Date(snapshot.fetchedAtMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    info.createDiv({
      cls: "pixel-weather-status-time",
      text: formatTemplate(t.settings.statusUpdatedAt, { time: timeStr }),
    });
  } else {
    info.createDiv({
      cls: "pixel-weather-status-meta",
      text: t.settings.statusNoData,
    });
  }

  const actions = card.createDiv({ cls: "pixel-weather-status-actions" });
  const refreshBtn = actions.createEl("button", {
    text: t.settings.refreshBtn,
    cls: "mod-cta",
  });
  refreshBtn.addEventListener("click", () => {
    refreshBtn.disabled = true;
    void onRefresh();
  });
}
