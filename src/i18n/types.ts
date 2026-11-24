import type {
  Season,
  TimeOfDay,
  TreeSpecies,
  TreeStage,
  WeatherCondition,
} from "../types";

export interface Translations {
  ribbonTooltip: string;
  commands: {
    toggleEffect: string;
    refreshWeather: string;
    cyclePreview: string;
    resetAutoWeather: string;
    waterTree: string;
  };
  notices: {
    effectEnabled: string;
    effectDisabled: string;
    weatherUpdated: string;
    weatherError: string;
    cityUpdated: string;
    cityNotFound: string;
    cityEmpty: string;
    previewMode: string;
    autoModeRestored: string;
  };
  conditions: Record<WeatherCondition, string>;
  tree: {
    menuTooltip: string;
    water: string;
    waterTooltip: string;
    placeLantern: string;
    placeBirdhouse: string;
    cancelPlacing: string;
    cancelPlacingTooltip: string;
    clearDecorations: string;
    thirstyHint: string;
    statsFormat: string;
    stages: Record<TreeStage, string>;
    seasons: Record<Season, string>;
    timesOfDay: Record<TimeOfDay, string>;
    species: Record<TreeSpecies, string>;
  };
  settings: {
    title: string;
    subtitle: string;
    weatherSectionTitle: string;
    treeSectionTitle: string;
    generalSectionTitle: string;
    sectionStatusOn: string;
    sectionStatusOff: string;
    statusCardTitle: string;
    statusLiveLabel: string;
    statusPreviewLabel: string;
    statusNoData: string;
    statusTempWind: string;
    statusUpdatedAt: string;
    refreshBtn: string;
    enabledName: string;
    enabledDesc: string;
    treeEnabledName: string;
    treeEnabledDesc: string;
    cityName: string;
    cityDesc: string;
    cityPlaceholder: string;
    citySearchBtn: string;
    cityResetParisBtn: string;
    cityCurrentLabel: string;
    overrideName: string;
    overrideDesc: string;
    overrideAuto: string;
    blockedWeatherName: string;
    blockedWeatherDesc: string;
    pixelSizeName: string;
    pixelSizeDesc: string;
    intensityName: string;
    intensityDesc: string;
    intensityOptions: {
      subtle: string;
      normal: string;
      intense: string;
    };
    opacityName: string;
    opacityDesc: string;
    targetScopeName: string;
    targetScopeDesc: string;
    targetScopeOptions: {
      active: string;
      all: string;
    };
    viewModeScopeName: string;
    viewModeScopeDesc: string;
    viewModeScopeOptions: {
      "editing-only": string;
      "all-markdown": string;
    };
    renderLayerName: string;
    renderLayerDesc: string;
    renderLayerOptions: {
      above: string;
      below: string;
    };
    cloudsName: string;
    cloudsDesc: string;
    groundName: string;
    groundDesc: string;
    typingName: string;
    typingDesc: string;
    refreshIntervalName: string;
    refreshIntervalDesc: string;
    interactionsName: string;
    interactionsDesc: string;
    overlaySideName: string;
    overlaySideDesc: string;
    sideRight: string;
    sideLeft: string;
    overlayWidthName: string;
    overlayWidthDesc: string;
    treeOpacityName: string;
    treeOpacityDesc: string;
    speciesName: string;
    speciesDesc: string;
    seasonName: string;
    seasonDesc: string;
    seasonAuto: string;
    timeOfDayName: string;
    timeOfDayDesc: string;
    timeOfDayAuto: string;
    growthSpeedName: string;
    growthSpeedDesc: string;
    speedRealistic: string;
    speedGentle: string;
    speedFast: string;
    speedDemo: string;
    visitorFreqName: string;
    visitorFreqDesc: string;
    freqCalm: string;
    freqNormal: string;
    freqLively: string;
    showSoilInfoName: string;
    showSoilInfoDesc: string;
    previewHeader: string;
    previewAgeName: string;
    previewAgeDesc: string;
    stagePresetSprout: string;
    stagePresetSapling: string;
    stagePresetYoung: string;
    stagePresetMature: string;
    stagePresetAncient: string;
    resetDecoName: string;
    resetDecoDesc: string;
    resetDecoBtn: string;
    resetTreeName: string;
    resetTreeDesc: string;
    resetTreeBtn: string;
    resetTreeConfirm: string;
    currentSummary: string;
    languageName: string;
    languageDesc: string;
    languageAuto: string;
  };
}
