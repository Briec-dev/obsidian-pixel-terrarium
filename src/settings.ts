import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { formatTemplate, getTranslations } from "./i18n";
import {
  formatLocationLabel,
  renderStatusCard,
  type SettingsHostPlugin,
} from "./settings/status-card";
import { renderTreeSection } from "./settings/tree-section";
import { renderWeatherSection } from "./settings/weather-section";
import type {
  CityLocation,
  PixelWeatherSettings,
  PluginLanguage,
  TreeSettings,
} from "./types";

export type { SettingsHostPlugin };

export class PixelWeatherSettingTab extends PluginSettingTab {
  private cityResultsEl: HTMLElement | null = null;
  private confirmResetTree = false;
  private weatherSectionOpen = false;
  private treeSectionOpen = false;
  private pendingSettingsPatch: Partial<PixelWeatherSettings> | null = null;
  private pendingTreePatch: Partial<TreeSettings> | null = null;
  private sliderDebounceTimer: number | null = null;

  constructor(
    app: App,
    private host: SettingsHostPlugin,
  ) {
    super(app, host as never);
  }

  hide(): void {
    this.confirmResetTree = false;
    void this.flushPendingSliderPatches();
  }

  private queueSettingsPatch(patch: Partial<PixelWeatherSettings>): void {
    this.pendingSettingsPatch = {
      ...(this.pendingSettingsPatch ?? {}),
      ...patch,
    };
    this.scheduleSliderFlush();
  }

  private queueTreePatch(patch: Partial<TreeSettings>): void {
    this.pendingTreePatch = {
      ...(this.pendingTreePatch ?? {}),
      ...patch,
    };
    this.scheduleSliderFlush();
  }

  private scheduleSliderFlush(): void {
    if (this.sliderDebounceTimer !== null) {
      window.clearTimeout(this.sliderDebounceTimer);
    }
    this.sliderDebounceTimer = window.setTimeout(() => {
      this.sliderDebounceTimer = null;
      void this.flushPendingSliderPatches();
    }, 200);
  }

  private async flushPendingSliderPatches(): Promise<void> {
    if (this.sliderDebounceTimer !== null) {
      window.clearTimeout(this.sliderDebounceTimer);
      this.sliderDebounceTimer = null;
    }
    const settingsPatch = this.pendingSettingsPatch;
    const treePatch = this.pendingTreePatch;
    this.pendingSettingsPatch = null;
    this.pendingTreePatch = null;

    if (settingsPatch && treePatch) {
      await this.host.updateSettings({
        ...settingsPatch,
        tree: {
          ...this.host.getSettings().tree,
          ...treePatch,
        },
      });
    } else if (settingsPatch) {
      await this.host.updateSettings(settingsPatch);
    } else if (treePatch) {
      await this.host.updateTreeSettings(treePatch);
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("pixel-weather-settings");

    const settings = this.host.getSettings();
    const treeState = this.host.getTreeState();
    const t = getTranslations(settings.language);
    const snapshot = this.host.getLastWeather();
    const effectiveCondition = this.host.getEffectiveCondition();

    containerEl.createEl("p", {
      cls: "pixel-weather-settings-subtitle",
      text: t.settings.subtitle,
    });

    renderStatusCard(
      containerEl,
      settings,
      snapshot,
      effectiveCondition,
      async () => {
        await this.host.refreshWeather(true);
        this.display();
      },
    );

    // Section 1: Weather
    this.cityResultsEl = renderWeatherSection(containerEl, settings, {
      host: this.host,
      isOpen: this.weatherSectionOpen,
      onToggleOpen: (open) => {
        this.weatherSectionOpen = open;
      },
      queueSettingsPatch: (patch) => this.queueSettingsPatch(patch),
      onCitySearch: (query) => this.handleCitySearch(query),
      onRedisplay: () => this.display(),
    });

    // Section 2: Companion Tree
    renderTreeSection(containerEl, settings, treeState, {
      host: this.host,
      isOpen: this.treeSectionOpen,
      onToggleOpen: (open) => {
        this.treeSectionOpen = open;
      },
      queueTreePatch: (patch) => this.queueTreePatch(patch),
      getConfirmResetTree: () => this.confirmResetTree,
      setConfirmResetTree: (val) => {
        this.confirmResetTree = val;
      },
      onRedisplay: () => this.display(),
    });

    // Section 3: General
    new Setting(containerEl).setName(t.settings.generalSectionTitle).setHeading();

    new Setting(containerEl)
      .setName(t.settings.languageName)
      .setDesc(t.settings.languageDesc)
      .addDropdown((dd) =>
        dd
          .addOption("auto", t.settings.languageAuto)
          .addOption("fr", "Français")
          .addOption("en", "English")
          .setValue(settings.language)
          .onChange(async (val) => {
            await this.host.updateSettings({ language: val as PluginLanguage });
            this.display();
          }),
      );
  }

  private async handleCitySearch(query: string): Promise<void> {
    const settings = this.host.getSettings();
    const t = getTranslations(settings.language);
    const trimmed = query.trim();
    if (!trimmed) {
      new Notice(t.notices.cityEmpty);
      return;
    }

    try {
      const results = await this.host.searchCities(trimmed);
      if (results.length === 0) {
        new Notice(formatTemplate(t.notices.cityNotFound, { query: trimmed }));
        return;
      }

      const top = results[0];
      await this.host.selectLocation(top);
      new Notice(
        formatTemplate(t.notices.cityUpdated, {
          city: top.name,
          country: top.country || "—",
        }),
      );

      this.display();
      if (results.length > 1 && this.cityResultsEl) {
        this.renderCitySuggestions(results);
      }
    } catch {
      new Notice(formatTemplate(t.notices.weatherError, { city: trimmed }));
    }
  }

  private renderCitySuggestions(results: CityLocation[]): void {
    if (!this.cityResultsEl) return;
    this.cityResultsEl.empty();

    for (const loc of results.slice(0, 4)) {
      const chip = this.cityResultsEl.createEl("button", {
        cls: "pixel-weather-city-chip",
        text: formatLocationLabel(loc),
      });
      chip.addEventListener("click", () => {
        void (async () => {
          await this.host.selectLocation(loc);
          this.display();
        })();
      });
    }
  }
}
