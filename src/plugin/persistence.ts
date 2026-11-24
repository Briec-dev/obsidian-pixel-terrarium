import { sanitizePluginData } from "../shared/sanitize";
import type { PixelWeatherData } from "../types";

/**
 * Manages serialized loading, debounced/passive saving, and diff-based deduplication
 * of plugin data so idle ticks do not cause unnecessary disk writes.
 */
export class PluginDataStore {
  static readonly PASSIVE_SAVE_INTERVAL_MS = 5 * 60 * 1000;
  static readonly DEBOUNCE_SAVE_DELAY_MS = 3000;

  private saveTimerId: number | null = null;
  private passiveSaveTimerId: number | null = null;
  private lastSavedSerialized = "";

  serializeForDiff(payload: PixelWeatherData): string {
    return JSON.stringify({
      settings: payload.settings,
      lastWeather: payload.lastWeather,
      treeState: {
        ...payload.treeState,
        lastTickAt: 0,
      },
    });
  }

  async load(reader: () => Promise<unknown>): Promise<PixelWeatherData> {
    const raw: unknown = await reader();
    const sanitized = sanitizePluginData(raw);
    this.lastSavedSerialized = this.serializeForDiff(sanitized);
    return sanitized;
  }

  schedulePassiveSave(onFlush: () => Promise<void>): void {
    if (this.saveTimerId !== null || this.passiveSaveTimerId !== null) return;
    this.passiveSaveTimerId = window.setTimeout(() => {
      this.passiveSaveTimerId = null;
      void onFlush();
    }, PluginDataStore.PASSIVE_SAVE_INTERVAL_MS);
  }

  scheduleSave(onFlush: () => Promise<void>): void {
    if (this.passiveSaveTimerId !== null) {
      window.clearTimeout(this.passiveSaveTimerId);
      this.passiveSaveTimerId = null;
    }
    if (this.saveTimerId !== null) return;
    this.saveTimerId = window.setTimeout(() => {
      this.saveTimerId = null;
      void onFlush();
    }, PluginDataStore.DEBOUNCE_SAVE_DELAY_MS);
  }

  clearTimers(): void {
    if (this.saveTimerId !== null) {
      window.clearTimeout(this.saveTimerId);
      this.saveTimerId = null;
    }
    if (this.passiveSaveTimerId !== null) {
      window.clearTimeout(this.passiveSaveTimerId);
      this.passiveSaveTimerId = null;
    }
  }

  async saveNow(
    payload: PixelWeatherData,
    writer: (data: PixelWeatherData) => Promise<void>,
  ): Promise<boolean> {
    this.clearTimers();
    const diffKey = this.serializeForDiff(payload);
    if (diffKey === this.lastSavedSerialized) {
      return false;
    }
    await writer(payload);
    this.lastSavedSerialized = diffKey;
    return true;
  }
}
