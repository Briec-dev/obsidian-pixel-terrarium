import { Setting } from "obsidian";
import { formatTemplate, getStageLabel, getTranslations } from "../i18n";
import { getTreeStage } from "../tree/growth";
import type {
  OverlaySide,
  PixelWeatherSettings,
  SeasonOverride,
  TimeOfDayOverride,
  TreeSettings,
  TreeSpecies,
  TreeState,
  VisitorFrequency,
} from "../types";
import { createCollapsibleSection } from "./collapsible-section";
import type { SettingsHostPlugin } from "./status-card";

export interface TreeSectionCallbacks {
  host: SettingsHostPlugin;
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  queueTreePatch: (patch: Partial<TreeSettings>) => void;
  getConfirmResetTree: () => boolean;
  setConfirmResetTree: (val: boolean) => void;
  onRedisplay: () => void;
}

export function renderTreeSection(
  containerEl: HTMLElement,
  settings: PixelWeatherSettings,
  treeState: TreeState,
  callbacks: TreeSectionCallbacks,
): void {
  const {
    host,
    isOpen,
    onToggleOpen,
    queueTreePatch,
    getConfirmResetTree,
    setConfirmResetTree,
    onRedisplay,
  } = callbacks;
  const t = getTranslations(settings.language);
  const treeCfg = settings.tree;

  const { bodyEl } = createCollapsibleSection(containerEl, {
    title: t.settings.treeSectionTitle,
    isActive: treeCfg.visible,
    activeLabel: t.settings.sectionStatusOn,
    inactiveLabel: t.settings.sectionStatusOff,
    isOpen,
    onToggleOpen,
  });

  new Setting(bodyEl)
    .setName(t.settings.treeEnabledName)
    .setDesc(t.settings.treeEnabledDesc)
    .addToggle((tg) =>
      tg.setValue(treeCfg.visible).onChange(async (val) => {
        await host.updateTreeSettings({ visible: val });
        onRedisplay();
      }),
    );

  new Setting(bodyEl)
    .setName(t.settings.overlaySideName)
    .setDesc(t.settings.overlaySideDesc)
    .addDropdown((dd) =>
      dd
        .addOption("right", t.settings.sideRight)
        .addOption("left", t.settings.sideLeft)
        .setValue(treeCfg.overlaySide)
        .onChange(async (val) => {
          await host.updateTreeSettings({
            overlaySide: val as OverlaySide,
          });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.overlayWidthName)
    .setDesc(t.settings.overlayWidthDesc)
    .addSlider((sl) =>
      sl
        .setLimits(140, 360, 10)
        .setValue(treeCfg.overlayWidth)
        .onChange((val) => {
          queueTreePatch({ overlayWidth: val });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.treeOpacityName)
    .setDesc(t.settings.treeOpacityDesc)
    .addSlider((sl) =>
      sl
        .setLimits(0.3, 1.0, 0.05)
        .setValue(treeCfg.overlayOpacity)
        .onChange((val) => {
          queueTreePatch({ overlayOpacity: val });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.speciesName)
    .setDesc(t.settings.speciesDesc)
    .addDropdown((dd) =>
      dd
        .addOption("oak", t.tree.species.oak)
        .addOption("sakura", t.tree.species.sakura)
        .addOption("pine", t.tree.species.pine)
        .setValue(treeCfg.species)
        .onChange(async (val) => {
          await host.updateTreeSettings({
            species: val as TreeSpecies,
          });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.seasonName)
    .setDesc(t.settings.seasonDesc)
    .addDropdown((dd) =>
      dd
        .addOption("auto", t.settings.seasonAuto)
        .addOption("spring", t.tree.seasons.spring)
        .addOption("summer", t.tree.seasons.summer)
        .addOption("autumn", t.tree.seasons.autumn)
        .addOption("winter", t.tree.seasons.winter)
        .setValue(treeCfg.seasonOverride)
        .onChange(async (val) => {
          await host.updateTreeSettings({
            seasonOverride: val as SeasonOverride,
          });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.timeOfDayName)
    .setDesc(t.settings.timeOfDayDesc)
    .addDropdown((dd) =>
      dd
        .addOption("auto", t.settings.timeOfDayAuto)
        .addOption("dawn", t.tree.timesOfDay.dawn)
        .addOption("day", t.tree.timesOfDay.day)
        .addOption("dusk", t.tree.timesOfDay.dusk)
        .addOption("night", t.tree.timesOfDay.night)
        .setValue(treeCfg.timeOfDayOverride)
        .onChange(async (val) => {
          await host.updateTreeSettings({
            timeOfDayOverride: val as TimeOfDayOverride,
          });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.growthSpeedName)
    .setDesc(t.settings.growthSpeedDesc)
    .addDropdown((dd) =>
      dd
        .addOption("1", t.settings.speedRealistic)
        .addOption("5", t.settings.speedGentle)
        .addOption("25", t.settings.speedFast)
        .addOption("100", t.settings.speedDemo)
        .setValue(String(treeCfg.growthSpeedMultiplier))
        .onChange(async (val) => {
          await host.updateTreeSettings({
            growthSpeedMultiplier: Number(val) || 1,
          });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.visitorFreqName)
    .setDesc(t.settings.visitorFreqDesc)
    .addDropdown((dd) =>
      dd
        .addOption("calm", t.settings.freqCalm)
        .addOption("normal", t.settings.freqNormal)
        .addOption("lively", t.settings.freqLively)
        .setValue(treeCfg.visitorFrequency)
        .onChange(async (val) => {
          await host.updateTreeSettings({
            visitorFrequency: val as VisitorFrequency,
          });
        }),
    );

  new Setting(bodyEl)
    .setName(t.settings.showSoilInfoName)
    .setDesc(t.settings.showSoilInfoDesc)
    .addToggle((tg) =>
      tg.setValue(treeCfg.showSoilInfo).onChange(async (val) => {
        await host.updateTreeSettings({ showSoilInfo: val });
      }),
    );

  new Setting(bodyEl).setName(t.settings.previewHeader).setHeading();

  const currentStage = getTreeStage(treeState.growthHours);
  bodyEl.createEl("p", {
    cls: "setting-item-description",
    text: formatTemplate(t.settings.currentSummary, {
      stage: getStageLabel(settings.language, currentStage),
      hours: treeState.growthHours.toFixed(1),
      moisture: Math.round(treeState.moisture),
      waterings: treeState.timesWatered,
      visitors: treeState.visitorInteractions,
    }),
  });

  const presetRow = new Setting(bodyEl)
    .setName(t.settings.previewAgeName)
    .setDesc(t.settings.previewAgeDesc);
  presetRow.settingEl.addClass("pixel-weather-preset-row");

  const presets: Array<{ label: string; hours: number }> = [
    { label: t.settings.stagePresetSprout, hours: 0.3 },
    { label: t.settings.stagePresetSapling, hours: 12 },
    { label: t.settings.stagePresetYoung, hours: 40 },
    { label: t.settings.stagePresetMature, hours: 90 },
    { label: t.settings.stagePresetAncient, hours: 180 },
  ];
  for (const p of presets) {
    presetRow.addButton((btn) =>
      btn.setButtonText(p.label).onClick(async () => {
        await host.setTreeGrowthHours(p.hours);
        onRedisplay();
      }),
    );
  }

  new Setting(bodyEl)
    .setName(t.settings.resetDecoName)
    .setDesc(t.settings.resetDecoDesc)
    .addButton((btn) =>
      btn.setButtonText(t.settings.resetDecoBtn).onClick(async () => {
        await host.clearTreeDecorations();
        onRedisplay();
      }),
    );

  new Setting(bodyEl)
    .setName(t.settings.resetTreeName)
    .setDesc(t.settings.resetTreeDesc)
    .addButton((btn) => {
      btn
        .setButtonText(
          getConfirmResetTree()
            ? t.settings.resetTreeConfirm
            : t.settings.resetTreeBtn,
        )
        .onClick(async () => {
          if (!getConfirmResetTree()) {
            setConfirmResetTree(true);
            onRedisplay();
            return;
          }
          setConfirmResetTree(false);
          await host.resetTree();
          onRedisplay();
        });
      btn.buttonEl.addClass("mod-warning");
    });
}
