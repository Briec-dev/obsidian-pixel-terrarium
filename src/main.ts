import { Notice, Platform, Plugin, requestUrl, type Command } from "obsidian";
import { EditorOverlayManager } from "./editor-overlay";
import {
  formatTemplate,
  getConditionLabel,
  getOverrideConditionList,
  getTranslations,
  resolveLanguage,
  type Translations,
} from "./i18n";
import { PluginDataStore } from "./plugin/persistence";
import { PixelWeatherSettingTab, type SettingsHostPlugin } from "./settings";
import { applyWatering, applyWritingBoost, advancePassiveGrowth } from "./tree/growth";
import { getCityLocalHour } from "./tree/time-season";
import type { TreeWeatherInput } from "./tree-renderer";
import { SideTreeWidget, type WidgetHostActions } from "./tree-widget";
import {
  createInitialTreeState,
  DEFAULT_SETTINGS,
  type CityLocation,
  type PixelWeatherData,
  type PixelWeatherSettings,
  type TreeSettings,
  type TreeState,
  type WeatherCondition,
  type WeatherSnapshot,
} from "./types";
import { resolveUnblockedCondition, WeatherService } from "./weather-service";

export default class PixelWeatherPlugin extends Plugin implements SettingsHostPlugin {
  private pluginSettings: PixelWeatherSettings = {
    ...DEFAULT_SETTINGS,
    tree: { ...DEFAULT_SETTINGS.tree },
  };
  private lastWeather: WeatherSnapshot | null = null;
  private treeState: TreeState = createInitialTreeState();

  private readonly dataStore = new PluginDataStore();
  private weatherService: WeatherService | null = null;
  private overlayManager: EditorOverlayManager | null = null;
  private treeRootEl: HTMLElement | null = null;
  private treeWidget: SideTreeWidget | null = null;

  private weatherRibbonEl: HTMLElement | null = null;
  private registeredCommands: Array<{
    id: string;
    key: keyof Translations["commands"];
    cmd: Command;
  }> = [];

  private treeDoc: Document | null = null;
  private bodyObserver: MutationObserver | null = null;
  private modalContainerObserver: MutationObserver | null = null;
  private observedModalContainer: Element | null = null;
  private modalSyncRafId: number | null = null;
  private isSettingsModalOpen = false;
  private lastIsDarkTheme = false;
  private lastIsLightTheme = false;
  private refreshIntervalId: number | null = null;
  private growthTimerId: number | null = null;

  private isFetching = false;
  private pendingRefresh = false;
  private pendingRefreshNotice = false;
  private isUnloaded = false;
  private lastTypingImpulseMs = 0;
  private lastGrowthTickMs = Date.now();
  private lastEditBoostMs = 0;

  async onload(): Promise<void> {
    this.isUnloaded = false;
    await this.loadPluginData();
    if (this.isUnloaded) return;

    this.weatherService = new WeatherService(async (url) => {
      const response = await requestUrl({ url, method: "GET" });
      return {
        status: response.status,
        json: response.json,
      };
    });

    this.overlayManager = new EditorOverlayManager(this.app, {
      getSettings: () => this.pluginSettings,
      getEffectiveCondition: () => this.getEffectiveCondition(),
      getWindSpeedKmh: () => this.lastWeather?.windSpeedKmh ?? 10,
      isDarkTheme: () => this.getMainWorkspaceDocument().body.classList.contains("theme-dark"),
      getTreeCollider: () => this.treeWidget?.getColliderSnapshot() ?? null,
      notifyTreeOverlap: () => this.treeWidget?.notifyExternalOverlap(),
    });

    this.addSettingTab(new PixelWeatherSettingTab(this.app, this));

    this.weatherRibbonEl = this.addRibbonIcon(
      "cloud-sun",
      getTranslations(this.pluginSettings.language).ribbonTooltip,
      () => this.toggleEnabledWithNotice(),
    );

    this.registerCommands();

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.treeWidget?.invalidateCachedRects();
        this.overlayManager?.syncAllLeaves();
        this.syncSettingsModalState();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.treeWidget?.invalidateCachedRects();
        this.overlayManager?.syncAllLeaves();
        this.syncSettingsModalState();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.overlayManager?.syncAllLeaves();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.overlayManager?.syncAllLeaves();
        this.syncTreeAppearance();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        const now = Date.now();
        if (this.pluginSettings.enabled && this.pluginSettings.reactToTyping) {
          if (now - this.lastTypingImpulseMs >= 350) {
            this.lastTypingImpulseMs = now;
            this.overlayManager?.triggerTypingImpulse();
          }
        }
        if (this.pluginSettings.tree.visible) {
          this.applyThrottledWritingBoost(now);
        }
      }),
    );

    this.registerDomEvent(window, "focus", () => {
      this.syncSettingsModalState();
    });

    const doc = this.getMainWorkspaceDocument();
    this.treeDoc = doc;
    this.lastIsDarkTheme = doc.body.classList.contains("theme-dark");
    this.lastIsLightTheme = doc.body.classList.contains("theme-light");
    this.isSettingsModalOpen = this.findOpenSettingsModal(doc) !== null;
    this.bodyObserver = new MutationObserver((mutations) => {
      let classChanged = false;
      let relevantChildListChanged = false;
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "class") {
          classChanged = true;
        } else if (mutation.type === "childList") {
          if (this.isTreeOverlayOnlyMutation(mutation)) {
            continue;
          }
          relevantChildListChanged = true;
        }
      }

      if (classChanged) {
        const currentDoc = this.treeDoc ?? this.getMainWorkspaceDocument();
        const isDark = currentDoc.body.classList.contains("theme-dark");
        const isLight = currentDoc.body.classList.contains("theme-light");
        if (isDark !== this.lastIsDarkTheme || isLight !== this.lastIsLightTheme) {
          this.lastIsDarkTheme = isDark;
          this.lastIsLightTheme = isLight;
          this.overlayManager?.syncAllLeaves();
        }
      }

      if (relevantChildListChanged) {
        this.syncSettingsModalState();
        this.scheduleDeferredModalSync();
      }
    });
    this.bodyObserver.observe(doc.body, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
    });

    this.scheduleRefreshTimer();

    this.lastGrowthTickMs = Date.now();
    this.growthTimerId = window.setInterval(() => this.onPassiveTreeTick(), 15_000);
    this.registerInterval(this.growthTimerId);

    this.app.workspace.onLayoutReady(() => {
      if (this.isUnloaded) return;

      this.registerEvent(
        this.app.vault.on("create", () => {
          if (this.pluginSettings.tree.visible) {
            this.applyThrottledWritingBoost(Date.now());
          }
        }),
      );

      this.ensureTreeOverlay();
      this.syncSettingsModalState(true);
      this.overlayManager?.syncAllLeaves();
      void this.refreshWeatherIfStale();
    });
  }

  onunload(): void {
    this.isUnloaded = true;
    if (this.modalSyncRafId !== null) {
      window.cancelAnimationFrame(this.modalSyncRafId);
      this.modalSyncRafId = null;
    }
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.modalContainerObserver?.disconnect();
    this.modalContainerObserver = null;
    this.observedModalContainer = null;
    this.treeDoc = null;
    this.isSettingsModalOpen = false;
    this.overlayManager?.destroy();
    this.overlayManager = null;
    this.destroyTreeOverlay();
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    if (this.growthTimerId !== null) {
      window.clearInterval(this.growthTimerId);
      this.growthTimerId = null;
    }
    this.weatherRibbonEl = null;
    this.registeredCommands = [];
    void this.savePluginData();
  }

  getSettings(): PixelWeatherSettings {
    return this.pluginSettings;
  }

  getTreeState(): TreeState {
    return this.treeState;
  }

  getLastWeather(): WeatherSnapshot | null {
    return this.lastWeather;
  }

  getEffectiveCondition(): WeatherCondition {
    if (this.pluginSettings.weatherOverride !== "auto") {
      return this.pluginSettings.weatherOverride;
    }
    let rawCondition: WeatherCondition;
    let isDay: boolean;
    if (this.lastWeather) {
      rawCondition = this.lastWeather.condition;
      isDay = this.lastWeather.isDay;
    } else {
      const loc = this.pluginSettings.location;
      const hour = getCityLocalHour(new Date(), loc.timezone, loc.longitude);
      isDay = hour >= 7 && hour < 20;
      rawCondition = isDay ? "partly-cloudy-day" : "partly-cloudy-night";
    }
    return resolveUnblockedCondition(
      rawCondition,
      this.pluginSettings.blockedConditions,
      isDay,
    );
  }

  getWeatherInputForTree(): TreeWeatherInput {
    const baseWind = this.lastWeather?.windSpeedKmh ?? 10;
    const effectiveWind =
      this.overlayManager?.getEffectiveWindSpeedKmh(baseWind) ?? baseWind;
    return {
      enabled: this.pluginSettings.enabled,
      interactionsEnabled: this.pluginSettings.treeWeatherInteractions,
      condition: this.getEffectiveCondition(),
      intensity: this.pluginSettings.intensity,
      windSpeedKmh: effectiveWind,
      lightningFlash: this.overlayManager?.getMaxFlashAlpha() ?? 0,
    };
  }

  getTreeWidgetHost(): WidgetHostActions {
    return {
      getSettings: () => this.pluginSettings,
      getState: () => this.treeState,
      getWeatherInput: () => this.getWeatherInputForTree(),
      getWeatherIsDay: () => {
        if (this.pluginSettings.weatherOverride !== "auto") {
          const cond = this.pluginSettings.weatherOverride;
          if (cond === "clear-night" || cond === "partly-cloudy-night") return false;
          if (cond === "clear-day" || cond === "partly-cloudy-day") return true;
        }
        return this.lastWeather?.isDay;
      },
      updateState: (mutator) => {
        this.treeState = mutator(this.treeState);
        this.scheduleSave();
      },
    };
  }

  async updateSettings(patch: Partial<PixelWeatherSettings>): Promise<void> {
    const prevEnabled = this.pluginSettings.enabled;
    const prevInterval = this.pluginSettings.refreshIntervalMinutes;
    const prevLang = this.pluginSettings.language;
    this.pluginSettings = {
      ...this.pluginSettings,
      ...patch,
      tree: {
        ...this.pluginSettings.tree,
        ...(patch.tree ?? {}),
      },
    };
    await this.savePluginData();

    if (this.pluginSettings.refreshIntervalMinutes !== prevInterval) {
      this.scheduleRefreshTimer();
    }

    this.overlayManager?.syncAllLeaves();
    this.syncTreeAppearance();
    if (this.pluginSettings.language !== prevLang) {
      this.refreshLocalizedUi();
    }
    if (!prevEnabled && this.pluginSettings.enabled) {
      void this.refreshWeatherIfStale();
    }
  }

  async updateTreeSettings(patch: Partial<TreeSettings>): Promise<void> {
    await this.updateSettings({
      tree: {
        ...this.pluginSettings.tree,
        ...patch,
      },
    });
  }

  async setTreeGrowthHours(hours: number): Promise<void> {
    const safeHours = Number.isFinite(hours) ? Math.max(0.3, hours) : 0.3;
    this.treeState = {
      ...this.treeState,
      growthHours: safeHours,
    };
    await this.savePluginData();
  }

  async clearTreeDecorations(): Promise<void> {
    this.treeState = {
      ...this.treeState,
      decorations: [],
    };
    await this.savePluginData();
  }

  async resetTree(): Promise<void> {
    this.treeState = createInitialTreeState(Date.now());
    await this.savePluginData();
  }

  async searchCities(query: string): Promise<CityLocation[]> {
    if (!this.weatherService) return [];
    return this.weatherService.searchCity(
      query,
      resolveLanguage(this.pluginSettings.language),
    );
  }

  private getLocationKey(loc: CityLocation): string {
    return `${loc.name}|${loc.latitude.toFixed(4)}|${loc.longitude.toFixed(4)}|${loc.timezone ?? ""}`;
  }

  async selectLocation(location: CityLocation): Promise<void> {
    this.pluginSettings = {
      ...this.pluginSettings,
      location,
    };
    this.lastWeather = null;
    await this.savePluginData();
    this.overlayManager?.syncAllLeaves();
    await this.refreshWeather(false);
  }

  async refreshWeather(showNotice = false): Promise<boolean> {
    if (!this.weatherService || this.isUnloaded) {
      return false;
    }
    if (this.isFetching) {
      this.pendingRefresh = true;
      this.pendingRefreshNotice = this.pendingRefreshNotice || showNotice;
      return false;
    }

    this.isFetching = true;
    const requestLocation = { ...this.pluginSettings.location };
    const requestKey = this.getLocationKey(requestLocation);
    const t = getTranslations(this.pluginSettings.language);

    try {
      const snapshot = await this.weatherService.fetchCurrentWeather(requestLocation);
      if (this.isUnloaded) return false;

      if (this.getLocationKey(this.pluginSettings.location) !== requestKey) {
        this.pendingRefresh = true;
        return false;
      }

      this.lastWeather = snapshot;
      if (!this.pluginSettings.location.timezone && snapshot.timezone) {
        this.pluginSettings = {
          ...this.pluginSettings,
          location: {
            ...this.pluginSettings.location,
            timezone: snapshot.timezone,
          },
        };
      }
      await this.savePluginData();
      this.overlayManager?.syncAllLeaves();

      if (showNotice) {
        new Notice(
          formatTemplate(t.notices.weatherUpdated, {
            city: snapshot.locationName,
            condition: getConditionLabel(
              this.pluginSettings.language,
              this.getEffectiveCondition(),
            ),
            temp: Math.round(snapshot.temperatureC),
          }),
        );
      }
      return true;
    } catch {
      if (this.getLocationKey(this.pluginSettings.location) !== requestKey) {
        this.pendingRefresh = true;
        return false;
      }
      if (showNotice) {
        new Notice(
          formatTemplate(t.notices.weatherError, {
            city: this.pluginSettings.location.name,
          }),
        );
      }
      return false;
    } finally {
      this.isFetching = false;
      if (this.pendingRefresh && !this.isUnloaded) {
        const nextNotice = this.pendingRefreshNotice;
        this.pendingRefresh = false;
        this.pendingRefreshNotice = false;
        void this.refreshWeather(nextNotice);
      } else {
        this.pendingRefresh = false;
        this.pendingRefreshNotice = false;
      }
    }
  }

  private async toggleEnabledWithNotice(): Promise<void> {
    const nextEnabled = !(this.pluginSettings.enabled || this.pluginSettings.tree.visible);
    await this.updateSettings({
      enabled: nextEnabled,
      tree: { ...this.pluginSettings.tree, visible: nextEnabled },
    });
    const t = getTranslations(this.pluginSettings.language);
    new Notice(nextEnabled ? t.notices.effectEnabled : t.notices.effectDisabled);
  }

  private applyThrottledWritingBoost(now: number): void {
    if (now - this.lastEditBoostMs < 10_000) return;
    this.lastEditBoostMs = now;
    this.treeState = applyWritingBoost(
      this.treeState,
      this.pluginSettings.tree.growthSpeedMultiplier,
      now,
    );
    this.schedulePassiveSave();
  }

  private onPassiveTreeTick(): void {
    const now = Date.now();
    if (!this.pluginSettings.tree.visible) {
      this.lastGrowthTickMs = now;
      return;
    }
    const elapsedSec = Math.max(0, (now - this.lastGrowthTickMs) / 1000);
    this.lastGrowthTickMs = now;

    const weatherCond =
      this.pluginSettings.enabled && this.pluginSettings.treeWeatherInteractions
        ? this.getEffectiveCondition()
        : null;

    const prev = this.treeState;
    const next = advancePassiveGrowth(
      prev,
      elapsedSec,
      this.pluginSettings.tree.growthSpeedMultiplier,
      now,
      weatherCond,
    );
    this.treeState = next;
    if (
      next.growthHours !== prev.growthHours ||
      next.moisture !== prev.moisture ||
      next.activeSeconds !== prev.activeSeconds
    ) {
      this.schedulePassiveSave();
    }
  }

  private getMainWorkspaceDocument(): Document {
    return this.app.workspace.containerEl?.ownerDocument ?? activeDocument;
  }

  private isTreeOverlayOnlyMutation(mutation: MutationRecord): boolean {
    if (!this.treeRootEl) return false;
    const added = mutation.addedNodes;
    const removed = mutation.removedNodes;
    const addedCount = added ? added.length : 0;
    const removedCount = removed ? removed.length : 0;
    if (addedCount === 0 && removedCount === 0) return false;

    for (let i = 0; i < addedCount; i++) {
      if (added[i] !== this.treeRootEl) return false;
    }
    for (let i = 0; i < removedCount; i++) {
      if (removed[i] !== this.treeRootEl) return false;
    }
    return true;
  }

  private isElementHiddenByStyle(el: Element): boolean {
    if (el.getAttribute("hidden") !== null) {
      return true;
    }
    const win = el.ownerDocument?.defaultView ?? window;
    if (typeof win?.getComputedStyle === "function") {
      const computed = win.getComputedStyle(el);
      if (computed.display === "none" || computed.visibility === "hidden") {
        return true;
      }
    }
    return false;
  }

  private findOpenSettingsModal(doc: Document): Element | null {
    const candidates = doc.body.querySelectorAll(
      ".modal.mod-settings, .modal-container.mod-settings",
    );
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (this.isElementHiddenByStyle(candidate)) {
        continue;
      }
      const container = candidate.closest(".modal-container");
      if (container && container !== candidate && this.isElementHiddenByStyle(container)) {
        continue;
      }
      return candidate;
    }
    return null;
  }

  private watchSettingsModalContainer(modalEl: Element | null): void {
    const nextContainer = modalEl ? (modalEl.closest(".modal-container") ?? modalEl) : null;
    if (nextContainer === this.observedModalContainer) {
      return;
    }
    this.modalContainerObserver?.disconnect();
    this.modalContainerObserver = null;
    this.observedModalContainer = nextContainer;

    if (!nextContainer || this.isUnloaded || typeof MutationObserver === "undefined") {
      return;
    }

    this.modalContainerObserver = new MutationObserver(() => {
      this.syncSettingsModalState();
    });
    this.modalContainerObserver.observe(nextContainer, {
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
  }

  private scheduleDeferredModalSync(): void {
    if (this.isUnloaded || this.modalSyncRafId !== null) return;
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      return;
    }
    this.modalSyncRafId = window.requestAnimationFrame(() => {
      this.modalSyncRafId = null;
      if (!this.isUnloaded) {
        this.syncSettingsModalState();
      }
    });
  }

  private syncSettingsModalState(forceSync = false): void {
    if (this.isUnloaded) return;
    const doc = this.treeDoc ?? this.getMainWorkspaceDocument();
    const openModal = this.findOpenSettingsModal(doc);
    const nextOpen = openModal !== null;
    const changed = nextOpen !== this.isSettingsModalOpen;
    this.isSettingsModalOpen = nextOpen;
    this.watchSettingsModalContainer(openModal);
    if (forceSync || changed) {
      this.syncTreeAppearance();
    }
  }

  private ensureTreeOverlay(): void {
    if (this.isUnloaded) return;
    if (this.treeRootEl && this.treeRootEl.isConnected && this.treeWidget) return;

    if (this.treeRootEl || this.treeWidget) {
      this.destroyTreeOverlay();
    }

    const doc = this.getMainWorkspaceDocument();
    this.treeDoc = doc;
    const staleRoots = doc.body.querySelectorAll(".side-tree-overlay-root");
    staleRoots.forEach((el) => el.remove());

    this.treeRootEl = doc.body.createDiv({
      cls: "side-tree-overlay-root",
    });

    this.treeWidget = new SideTreeWidget(
      this.treeRootEl,
      this.getTreeWidgetHost(),
    );
  }

  private syncTreeAppearance(): void {
    if (this.isUnloaded) return;
    const treeCfg = this.pluginSettings.tree;
    const isVisible = treeCfg.visible;

    if (!this.treeRootEl || !this.treeRootEl.isConnected || !this.treeWidget) {
      if (!isVisible) return;
      this.ensureTreeOverlay();
      if (!this.treeRootEl) return;
    }

    const isLeft = treeCfg.overlaySide === "left";
    const effectivelyVisible = isVisible && !this.isSettingsModalOpen;
    this.treeRootEl.toggleClass("is-left", isLeft);
    this.treeRootEl.toggleClass("is-right", !isLeft);
    this.treeRootEl.toggleClass("is-hidden", !isVisible);
    this.treeRootEl.toggleClass("is-settings-open", this.isSettingsModalOpen);
    this.treeRootEl.toggleClass("is-mobile", Platform.isMobile);
    this.treeRootEl.toggleClass("is-phone", Platform.isPhone);
    this.treeRootEl.setCssStyles({
      width: `${treeCfg.overlayWidth}px`,
      opacity: String(treeCfg.overlayOpacity),
    });
    this.treeWidget?.onVisibilityChanged(effectivelyVisible);
  }

  private destroyTreeOverlay(): void {
    if (this.treeWidget) {
      this.treeWidget.destroy();
      this.treeWidget = null;
    }
    if (this.treeRootEl) {
      this.treeRootEl.remove();
      this.treeRootEl = null;
    }
  }

  private async refreshWeatherIfStale(): Promise<void> {
    if (!this.pluginSettings.enabled) return;
    const maxAgeMs = this.pluginSettings.refreshIntervalMinutes * 60 * 1000;
    const isMissingOrStale =
      !this.lastWeather ||
      this.lastWeather.locationName !== this.pluginSettings.location.name ||
      Date.now() - this.lastWeather.fetchedAtMs >= Math.min(maxAgeMs, 5 * 60 * 1000);

    if (isMissingOrStale) {
      await this.refreshWeather(false);
    }
  }

  private scheduleRefreshTimer(): void {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
    const intervalMs = this.pluginSettings.refreshIntervalMinutes * 60 * 1000;
    this.refreshIntervalId = window.setInterval(() => {
      if (!this.pluginSettings.enabled) return;
      void this.refreshWeather(false);
    }, intervalMs);
    this.registerInterval(this.refreshIntervalId);
  }

  private refreshLocalizedUi(): void {
    const t = getTranslations(this.pluginSettings.language);
    this.weatherRibbonEl?.setAttribute("aria-label", t.ribbonTooltip);
    this.registerCommands();
    this.treeWidget?.refreshLabels();
  }

  private registerCommands(): void {
    const t = getTranslations(this.pluginSettings.language);

    if (this.registeredCommands.length > 0) {
      if (typeof this.removeCommand === "function") {
        for (const entry of this.registeredCommands) {
          this.removeCommand(entry.id);
        }
        this.registeredCommands = [];
      } else {
        for (const entry of this.registeredCommands) {
          entry.cmd.name = `${this.manifest.name}: ${t.commands[entry.key]}`;
        }
        return;
      }
    }

    const addLocalizedCommand = (
      id: string,
      key: keyof Translations["commands"],
      callback: () => void | Promise<void>,
    ) => {
      const cmd = this.addCommand({
        id,
        name: t.commands[key],
        callback,
      });
      this.registeredCommands.push({ id, key, cmd });
    };

    addLocalizedCommand("toggle", "toggleEffect", () =>
      this.toggleEnabledWithNotice(),
    );

    addLocalizedCommand("refresh-weather", "refreshWeather", async () => {
      await this.refreshWeather(true);
    });

    addLocalizedCommand("cycle-weather-preview", "cyclePreview", async () => {
      const list = getOverrideConditionList();
      const current = this.pluginSettings.weatherOverride;
      const idx = current === "auto" ? -1 : list.indexOf(current);
      const nextCondition = list[(idx + 1) % list.length];
      await this.updateSettings({
        enabled: true,
        weatherOverride: nextCondition,
      });
      const tr = getTranslations(this.pluginSettings.language);
      new Notice(
        formatTemplate(tr.notices.previewMode, {
          condition: getConditionLabel(this.pluginSettings.language, nextCondition),
        }),
      );
    });

    addLocalizedCommand("restore-auto-weather", "resetAutoWeather", async () => {
      await this.updateSettings({ weatherOverride: "auto" });
      const tr = getTranslations(this.pluginSettings.language);
      new Notice(tr.notices.autoModeRestored);
    });

    addLocalizedCommand("water-tree", "waterTree", () => {
      this.treeState = applyWatering(
        this.treeState,
        this.pluginSettings.tree.growthSpeedMultiplier,
      );
      this.scheduleSave();
      this.treeWidget?.triggerWatering();
    });
  }

  private async loadPluginData(): Promise<void> {
    const loaded = await this.dataStore.load(() => this.loadData());
    this.pluginSettings = loaded.settings;
    this.lastWeather = loaded.lastWeather;
    this.treeState = loaded.treeState;
  }

  private schedulePassiveSave(): void {
    this.dataStore.schedulePassiveSave(() => this.savePluginData());
  }

  private scheduleSave(): void {
    this.dataStore.scheduleSave(() => this.savePluginData());
  }

  private async savePluginData(): Promise<void> {
    const payload: PixelWeatherData = {
      settings: this.pluginSettings,
      lastWeather: this.lastWeather,
      treeState: this.treeState,
    };
    await this.dataStore.saveNow(payload, (data) => this.saveData(data));
  }
}
