import { Notice, Setting } from "obsidian";
import {
  formatTemplate,
  getConditionIconGlyph,
  getConditionLabel,
  getOverrideConditionList,
  getTranslations,
} from "../i18n";
import {
  PARIS_DEFAULT_LOCATION,
  type EffectIntensity,
  type PixelWeatherSettings,
  type RenderLayer,
  type TargetScope,
  type ViewModeScope,
  type WeatherOverride,
} from "../types";
import { createCollapsibleSection } from "./collapsible-section";
import { formatLocationLabel, type SettingsHostPlugin } from "./status-card";

export interface WeatherSectionCallbacks {
  host: SettingsHostPlugin;
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  queueSettingsPatch: (patch: Partial<PixelWeatherSettings>) => void;
  onCitySearch: (query: string) => Promise<void>;
  onRedisplay: () => void;
}

export function renderWeatherSection(
  containerEl: HTMLElement,
  settings: PixelWeatherSettings,
  callbacks: WeatherSectionCallbacks,
): HTMLElement {
  const {
    host,
    isOpen,
    onToggleOpen,
    queueSettingsPatch,
    onCitySearch,
    onRedisplay,
  } = callbacks;
  const t = getTranslations(settings.language);

  const { bodyEl } = createCollapsibleSection(containerEl, {
    title: t.settings.weatherSectionTitle,
    isActive: settings.enabled,
    activeLabel: t.settings.sectionStatusOn,
    inactiveLabel: t.settings.sectionStatusOff,
    isOpen,
    onToggleOpen,
  });

  new Setting(bodyEl)
    .setName(t.settings.enabledName)
    .setDesc(t.settings.enabledDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.enabled).onChange(async (value) => {
        await host.updateSettings({ enabled: value });
        onRedisplay();
      }),
    );

  let pendingCityQuery = settings.location.name;
  const cityDescFragment = createFragment();
  cityDescFragment.appendText(t.settings.cityDesc);
  cityDescFragment.createEl("br");
  const currentLabel = formatLocationLabel(settings.location);
  cityDescFragment.createSpan({
    cls: "pixel-weather-city-coords",
    text: formatTemplate(t.settings.cityCurrentLabel, {
      label: currentLabel,
      lat: settings.location.latitude.toFixed(2),
      lon: settings.location.longitude.toFixed(2),
    }),
  });

  const citySetting = new Setting(bodyEl)
    .setName(t.settings.cityName)
    .setDesc(cityDescFragment)
    .addText((text) => {
      text
        .setPlaceholder(t.settings.cityPlaceholder)
        .setValue(settings.location.name)
        .onChange((val) => {
          pendingCityQuery = val;
        });
      text.inputEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          void onCitySearch(pendingCityQuery);
        }
      });
    })
    .addButton((btn) =>
      btn
        .setButtonText(t.settings.citySearchBtn)
        .setCta()
        .onClick(() => {
          void onCitySearch(pendingCityQuery);
        }),
    )
    .addButton((btn) =>
      btn.setButtonText(t.settings.cityResetParisBtn).onClick(async () => {
        await host.selectLocation({ ...PARIS_DEFAULT_LOCATION });
        new Notice(
          formatTemplate(t.notices.cityUpdated, {
            city: PARIS_DEFAULT_LOCATION.name,
            country: PARIS_DEFAULT_LOCATION.country,
          }),
        );
        onRedisplay();
      }),
    );

  citySetting.settingEl.addClass("pixel-weather-city-setting");
  const cityResultsEl = citySetting.settingEl.createDiv({
    cls: "pixel-weather-city-results",
  });

  new Setting(bodyEl)
    .setName(t.settings.overrideName)
    .setDesc(t.settings.overrideDesc)
    .addDropdown((dd) => {
      dd.addOption("auto", t.settings.overrideAuto);
      for (const cond of getOverrideConditionList()) {
        dd.addOption(
          cond,
          `${getConditionIconGlyph(cond)} ${getConditionLabel(settings.language, cond)}`,
        );
      }
      dd.setValue(settings.weatherOverride);
      dd.onChange(async (val) => {
        await host.updateSettings({
          weatherOverride: val as WeatherOverride,
        });
        onRedisplay();
      });
    });

  const blockedSetting = new Setting(bodyEl)
    .setName(t.settings.blockedWeatherName)
    .setDesc(t.settings.blockedWeatherDesc);
  blockedSetting.settingEl.addClass("pixel-weather-blocked-row");

  for (const cond of getOverrideConditionList()) {
    const isBlocked = settings.blockedConditions.includes(cond);
    const chip = blockedSetting.controlEl.createEl("button", {
      cls: `pixel-weather-blocked-chip${isBlocked ? " is-blocked" : ""}`,
      text: `${getConditionIconGlyph(cond)} ${getConditionLabel(settings.language, cond)}`,
      attr: {
        type: "button",
        "aria-pressed": String(isBlocked),
      },
    });
    chip.addEventListener("click", () => {
      const next = isBlocked
        ? settings.blockedConditions.filter((c) => c !== cond)
        : [...settings.blockedConditions, cond];
      void (async () => {
        await host.updateSettings({ blockedConditions: next });
        onRedisplay();
      })();
    });
  }

  new Setting(bodyEl)
    .setName(t.settings.interactionsName)
    .setDesc(t.settings.interactionsDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.treeWeatherInteractions).onChange(async (val) => {
        await host.updateSettings({ treeWeatherInteractions: val });
      }),
    );

  new Setting(bodyEl)
    .setName(t.settings.pixelSizeName)
    .setDesc(t.settings.pixelSizeDesc)
    .addSlider((slider) =>
      slider
        .setLimits(2, 8, 1)
        .setValue(settings.pixelSize)
        .onChange((val) => {
          queueSettingsPatch({ pixelSize: val });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.intensityName)
    .setDesc(t.settings.intensityDesc)
    .addDropdown((dd) =>
      dd
        .addOption("subtle", t.settings.intensityOptions.subtle)
        .addOption("normal", t.settings.intensityOptions.normal)
        .addOption("intense", t.settings.intensityOptions.intense)
        .setValue(settings.intensity)
        .onChange(async (val) => {
          await host.updateSettings({ intensity: val as EffectIntensity });
        }),
    );

  const opacitySetting = new Setting(bodyEl)
    .setName(t.settings.opacityName)
    .setDesc(`${t.settings.opacityDesc} (${Math.round(settings.opacity * 100)}%)`)
    .addSlider((slider) =>
      slider
        .setLimits(10, 100, 5)
        .setValue(Math.round(settings.opacity * 100))
        .onChange((val) => {
          opacitySetting.setDesc(`${t.settings.opacityDesc} (${val}%)`);
          queueSettingsPatch({ opacity: val / 100 });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.targetScopeName)
    .setDesc(t.settings.targetScopeDesc)
    .addDropdown((dd) =>
      dd
        .addOption("active", t.settings.targetScopeOptions.active)
        .addOption("all", t.settings.targetScopeOptions.all)
        .setValue(settings.targetScope)
        .onChange(async (val) => {
          await host.updateSettings({ targetScope: val as TargetScope });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.viewModeScopeName)
    .setDesc(t.settings.viewModeScopeDesc)
    .addDropdown((dd) =>
      dd
        .addOption("editing-only", t.settings.viewModeScopeOptions["editing-only"])
        .addOption("all-markdown", t.settings.viewModeScopeOptions["all-markdown"])
        .setValue(settings.viewModeScope)
        .onChange(async (val) => {
          await host.updateSettings({ viewModeScope: val as ViewModeScope });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.renderLayerName)
    .setDesc(t.settings.renderLayerDesc)
    .addDropdown((dd) =>
      dd
        .addOption("above", t.settings.renderLayerOptions.above)
        .addOption("below", t.settings.renderLayerOptions.below)
        .setValue(settings.renderLayer)
        .onChange(async (val) => {
          await host.updateSettings({ renderLayer: val as RenderLayer });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.cloudsName)
    .setDesc(t.settings.cloudsDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.showCloudsAndCelestial).onChange(async (val) => {
        await host.updateSettings({ showCloudsAndCelestial: val });
      }),
    );

  new Setting(bodyEl)
    .setName(t.settings.groundName)
    .setDesc(t.settings.groundDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.showGroundAccumulation).onChange(async (val) => {
        await host.updateSettings({ showGroundAccumulation: val });
      }),
    );

  new Setting(bodyEl)
    .setName(t.settings.typingName)
    .setDesc(t.settings.typingDesc)
    .addToggle((toggle) =>
      toggle.setValue(settings.reactToTyping).onChange(async (val) => {
        await host.updateSettings({ reactToTyping: val });
      }),
    );

  new Setting(bodyEl)
    .setName(t.settings.refreshIntervalName)
    .setDesc(t.settings.refreshIntervalDesc)
    .addSlider((slider) =>
      slider
        .setLimits(5, 60, 5)
        .setValue(settings.refreshIntervalMinutes)
        .onChange((val) => {
          queueSettingsPatch({ refreshIntervalMinutes: val });
        }),
    );

  return cityResultsEl;
}
