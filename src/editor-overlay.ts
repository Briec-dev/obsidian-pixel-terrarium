import { MarkdownView, type App, type WorkspaceLeaf } from "obsidian";
import {
  buildTreeCollisionTarget,
  PixelWeatherSimulation,
  type RenderOptions,
  type TreeCollisionTarget,
} from "./pixel-renderer";
import { FixedStepLoop } from "./shared/frame-loop";
import { toCachedRect, type CachedRect } from "./shared/geometry";
import type { TreeColliderSnapshot } from "./tree-widget";
import type { PixelWeatherSettings, RenderLayer, WeatherCondition } from "./types";

interface LeafCanvasEntry {
  leaf: WorkspaceLeaf;
  hostEl: HTMLElement;
  canvasEl: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  simulation: PixelWeatherSimulation;
  resizeObserver: ResizeObserver;
  cssWidth: number;
  cssHeight: number;
  cachedRect: CachedRect | null;
  measuredOnce: boolean;
  lastRenderLayer: RenderLayer | null;
  lastOpacity: number;
  lastPixelSize: number;
}

export interface OverlayHostContext {
  getSettings(): PixelWeatherSettings;
  getEffectiveCondition(): WeatherCondition;
  getWindSpeedKmh(): number;
  isDarkTheme(): boolean;
  getTreeCollider?: () => TreeColliderSnapshot | null;
  notifyTreeOverlap?: () => void;
}

export class EditorOverlayManager {
  private static readonly FRAME_INTERVAL_MS = 40; // ~25 FPS retro pixel cadence

  private entries = new Map<WorkspaceLeaf, LeafCanvasEntry>();
  private lastActiveMarkdownLeaf: WorkspaceLeaf | null = null;
  private loop: FixedStepLoop;
  private syncRafId: number | null = null;
  private destroyed = false;
  private boundVisibilityChange: (() => void) | null = null;
  private visibilityDoc: Document | null = null;
  private boundWindowResize: (() => void) | null = null;

  constructor(
    private app: App,
    private host: OverlayHostContext,
  ) {
    this.loop = new FixedStepLoop({
      intervalMs: EditorOverlayManager.FRAME_INTERVAL_MS,
      canRun: () => {
        const doc = this.visibilityDoc ?? this.getMainDocument();
        const hidden = Boolean(doc?.hidden);
        return !this.destroyed && this.entries.size > 0 && !hidden;
      },
      onBeforeStart: () => {
        this.renderFrame(0.04);
      },
      onStep: (stepSec) => {
        this.renderFrame(stepSec);
      },
    });

    const doc = this.getMainDocument();
    if (doc) {
      this.boundVisibilityChange = () => {
        this.loop.sync();
      };
      this.visibilityDoc = doc;
      this.visibilityDoc.addEventListener("visibilitychange", this.boundVisibilityChange);
    }
    if (typeof window !== "undefined") {
      this.boundWindowResize = () => {
        for (const entry of this.entries.values()) {
          entry.cachedRect = null;
        }
        this.syncAllLeaves();
      };
      window.addEventListener("resize", this.boundWindowResize, { passive: true });
    }
  }

  private getMainDocument(): Document | null {
    const workspaceDoc = this.app.workspace.containerEl?.ownerDocument;
    if (workspaceDoc) return workspaceDoc;
    return typeof activeDocument !== "undefined" ? activeDocument : null;
  }

  getMaxFlashAlpha(): number {
    let maxFlash = 0;
    for (const entry of this.entries.values()) {
      const flash = entry.simulation.getFlashAlpha();
      if (flash > maxFlash) maxFlash = flash;
    }
    return maxFlash;
  }

  getEffectiveWindSpeedKmh(baseWindKmh: number): number {
    let maxWind = baseWindKmh;
    for (const entry of this.entries.values()) {
      const w = entry.simulation.getEffectiveWindSpeedKmh(baseWindKmh);
      if (w > maxWind) maxWind = w;
    }
    return maxWind;
  }

  syncAllLeaves(): void {
    if (this.destroyed || this.syncRafId !== null) return;
    this.syncRafId = window.requestAnimationFrame(() => {
      this.syncRafId = null;
      this.performSyncAllLeaves();
    });
  }

  private performSyncAllLeaves(): void {
    if (this.destroyed) return;

    const settings = this.host.getSettings();
    if (!settings.enabled) {
      this.clearAllEntries();
      this.loop.stop();
      return;
    }

    const markdownLeaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        markdownLeaves.push(leaf);
      }
    });

    const currentActiveLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null;
    if (currentActiveLeaf) {
      this.lastActiveMarkdownLeaf = currentActiveLeaf;
    } else if (
      this.lastActiveMarkdownLeaf &&
      (!markdownLeaves.includes(this.lastActiveMarkdownLeaf) ||
        !(this.lastActiveMarkdownLeaf.view instanceof MarkdownView) ||
        !this.lastActiveMarkdownLeaf.view.containerEl.isConnected)
    ) {
      this.lastActiveMarkdownLeaf = null;
    }

    const targetActiveLeaf =
      currentActiveLeaf ?? this.lastActiveMarkdownLeaf ?? markdownLeaves[0] ?? null;
    if (!this.lastActiveMarkdownLeaf && targetActiveLeaf) {
      this.lastActiveMarkdownLeaf = targetActiveLeaf;
    }

    const desiredLeaves = new Set<WorkspaceLeaf>();

    for (const leaf of markdownLeaves) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      if (settings.targetScope === "active" && targetActiveLeaf && leaf !== targetActiveLeaf) {
        continue;
      }
      if (settings.viewModeScope === "editing-only" && leaf.view.getMode() !== "source") {
        continue;
      }
      desiredLeaves.add(leaf);
    }

    for (const [leaf, entry] of this.entries.entries()) {
      if (!desiredLeaves.has(leaf) || !entry.hostEl.isConnected) {
        this.removeEntry(leaf);
      }
    }

    for (const leaf of desiredLeaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const hostEl = this.resolveHostElement(view);
      if (!hostEl) continue;

      const existing = this.entries.get(leaf);
      if (existing && existing.hostEl === hostEl) {
        const rect = hostEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          existing.cachedRect = toCachedRect(rect);
        }
        this.applyEntryAppearance(existing, settings);
      } else {
        if (existing) {
          this.removeEntry(leaf);
        }
        this.createEntry(leaf, hostEl, settings);
      }
    }

    this.loop.sync();
  }

  triggerTypingImpulse(): void {
    const current = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null;
    const activeLeaf =
      current ??
      (this.lastActiveMarkdownLeaf && this.entries.has(this.lastActiveMarkdownLeaf)
        ? this.lastActiveMarkdownLeaf
        : null);
    if (activeLeaf) {
      this.entries.get(activeLeaf)?.simulation.triggerTypingImpulse();
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.boundVisibilityChange && this.visibilityDoc) {
      this.visibilityDoc.removeEventListener("visibilitychange", this.boundVisibilityChange);
      this.boundVisibilityChange = null;
      this.visibilityDoc = null;
    }
    if (this.boundWindowResize && typeof window !== "undefined") {
      window.removeEventListener("resize", this.boundWindowResize);
      this.boundWindowResize = null;
    }
    if (this.syncRafId !== null) {
      window.cancelAnimationFrame(this.syncRafId);
      this.syncRafId = null;
    }
    this.loop.stop();
    this.clearAllEntries();
  }

  private resolveHostElement(view: MarkdownView): HTMLElement | null {
    const viewContent = view.containerEl.querySelector<HTMLElement>(".view-content");
    return viewContent ?? view.contentEl ?? view.containerEl;
  }

  private createEntry(
    leaf: WorkspaceLeaf,
    hostEl: HTMLElement,
    settings: PixelWeatherSettings,
  ): void {
    const doc = hostEl.ownerDocument;
    const canvasEl = doc.createElement("canvas");
    canvasEl.className = "pixel-weather-canvas";
    canvasEl.setAttribute("aria-hidden", "true");

    hostEl.classList.add("pixel-weather-host");
    hostEl.appendChild(canvasEl);

    const ctx = canvasEl.getContext("2d");
    const simulation = new PixelWeatherSimulation();

    const entry: LeafCanvasEntry = {
      leaf,
      hostEl,
      canvasEl,
      ctx,
      simulation,
      resizeObserver: new ResizeObserver(() => {
        this.measureEntry(entry, this.host.getSettings().pixelSize);
      }),
      cssWidth: 0,
      cssHeight: 0,
      cachedRect: null,
      measuredOnce: false,
      lastRenderLayer: null,
      lastOpacity: -1,
      lastPixelSize: -1,
    };

    entry.resizeObserver.observe(hostEl);
    this.entries.set(leaf, entry);
    this.applyEntryAppearance(entry, settings);
  }

  private applyEntryAppearance(
    entry: LeafCanvasEntry,
    settings: PixelWeatherSettings,
  ): void {
    if (entry.lastRenderLayer !== settings.renderLayer) {
      const isBelow = settings.renderLayer === "below";
      entry.hostEl.classList.toggle("pixel-weather-layer-below", isBelow);
      entry.canvasEl.classList.toggle("is-below", isBelow);
      entry.lastRenderLayer = settings.renderLayer;
    }

    if (entry.lastOpacity !== settings.opacity) {
      entry.canvasEl.setCssStyles({ opacity: String(settings.opacity) });
      entry.lastOpacity = settings.opacity;
    }

    if (
      !entry.measuredOnce ||
      entry.lastPixelSize !== settings.pixelSize ||
      entry.cssWidth === 0 ||
      entry.cssHeight === 0 ||
      !entry.cachedRect
    ) {
      this.measureEntry(entry, settings.pixelSize);
    }
  }

  private measureEntry(entry: LeafCanvasEntry, pixelSize: number): void {
    entry.measuredOnce = true;
    entry.lastPixelSize = pixelSize;
    const rect = entry.hostEl.getBoundingClientRect();
    const cssW = Math.max(0, Math.round(rect.width));
    const cssH = Math.max(0, Math.round(rect.height));
    if (cssW === 0 || cssH === 0) {
      entry.cssWidth = 0;
      entry.cssHeight = 0;
      entry.cachedRect = null;
      return;
    }

    entry.cachedRect = toCachedRect(rect);

    const safeScale = Math.max(2, Math.min(8, Math.round(pixelSize)));
    const gridW = Math.max(48, Math.ceil(cssW / safeScale));
    const gridH = Math.max(36, Math.ceil(cssH / safeScale));

    if (entry.canvasEl.width !== gridW || entry.canvasEl.height !== gridH) {
      entry.canvasEl.width = gridW;
      entry.canvasEl.height = gridH;
      if (entry.ctx) {
        entry.ctx.imageSmoothingEnabled = false;
      }
      entry.simulation.setGridSize(gridW, gridH);
    }

    entry.cssWidth = cssW;
    entry.cssHeight = cssH;
  }

  private removeEntry(leaf: WorkspaceLeaf): void {
    const entry = this.entries.get(leaf);
    if (!entry) return;
    entry.resizeObserver.disconnect();
    entry.canvasEl.remove();
    entry.hostEl.classList.remove("pixel-weather-host", "pixel-weather-layer-below");
    this.entries.delete(leaf);
  }

  private clearAllEntries(): void {
    for (const leaf of Array.from(this.entries.keys())) {
      this.removeEntry(leaf);
    }
  }

  private renderFrame(stepSec: number): void {
    const settings = this.host.getSettings();
    const baseOptions: RenderOptions = {
      condition: this.host.getEffectiveCondition(),
      intensity: settings.intensity,
      windSpeedKmh: this.host.getWindSpeedKmh(),
      showCloudsAndCelestial: settings.showCloudsAndCelestial,
      showGroundAccumulation: settings.showGroundAccumulation,
      isDarkTheme: this.host.isDarkTheme(),
      treeCollider: null,
    };

    const treeSnapshot = this.host.getTreeCollider?.() ?? null;
    let hadOverlap = false;

    for (const entry of this.entries.values()) {
      if (entry.cssWidth === 0 || entry.cssHeight === 0 || !entry.ctx) continue;

      let treeCollider: TreeCollisionTarget | null = null;
      if (treeSnapshot && entry.cachedRect) {
        treeCollider = buildTreeCollisionTarget(
          treeSnapshot,
          entry.cachedRect,
          entry.simulation.width,
          entry.simulation.height,
        );
        if (treeCollider) {
          hadOverlap = true;
        }
      }

      const opts: RenderOptions = treeCollider
        ? { ...baseOptions, treeCollider }
        : baseOptions;
      entry.simulation.step(stepSec, opts);
      entry.simulation.render(entry.ctx, opts);
    }

    if (hadOverlap) {
      this.host.notifyTreeOverlap?.();
    }
  }
}
