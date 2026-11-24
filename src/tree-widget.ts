import { Platform } from "obsidian";
import { FixedStepLoop } from "./shared/frame-loop";
import { isPointInRect, toCachedRect, type CachedRect } from "./shared/geometry";
import { clamp } from "./shared/math";
import { placeDecorationWithCaps } from "./tree/decorations";
import { applyWatering } from "./tree/growth";
import {
  findNearestBranchAnchor,
  generateTreeSkeleton,
  repositionDecorationsToBranches,
} from "./tree/skeleton";
import { isRainyCondition, resolveSeason, resolveTimeOfDay } from "./tree/time-season";
import { TreeDockMenu } from "./tree/widget-menu";
import {
  hitTestDecoration,
  TreeSimulation,
  type TreeWeatherInput,
} from "./tree-renderer";
import type {
  DecorationType,
  OverlaySide,
  PixelWeatherSettings,
  PlacedDecoration,
  TreeSkeleton,
  TreeSpecies,
  TreeState,
} from "./types";

export interface TreeColliderSnapshot {
  rect: CachedRect;
  boundingBox?: { minX: number; minY: number; maxX: number; maxY: number };
  mask: Uint8Array;
  maskW: number;
  maskH: number;
  onRainImpact: (normX: number, normY: number, windVx: number) => void;
  onSnowImpact: (normX: number, normY: number) => void;
}

export interface WidgetHostActions {
  getSettings(): PixelWeatherSettings;
  getState(): TreeState;
  getWeatherInput(): TreeWeatherInput;
  getWeatherIsDay(): boolean | undefined;
  updateState(mutator: (state: TreeState) => TreeState): void;
}

const IGNORED_CLICK_ANCESTOR_SELECTOR =
  ".modal-container, .menu, .suggestion-container, .notice, button, a, input, select, textarea, .clickable-icon, .workspace-sidedock, .mod-right-split, .mod-left-split, .tree-item-self, .canvas-wrapper, .graph-view";

export class SideTreeWidget {
  private static readonly FRAME_INTERVAL_MS = 50;

  private containerEl: HTMLElement;
  private canvasEl: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private dockMenu: TreeDockMenu;

  private simulation = new TreeSimulation();
  private skeleton: TreeSkeleton | null = null;
  private lastSkelSeed = -1;
  private lastSkelGrowthStep = -1;
  private lastSkelSpecies: TreeSpecies | null = null;
  private lastSkelWidth = -1;
  private lastSkelHeight = -1;
  private lastSkelSide: OverlaySide | null = null;
  private loop: FixedStepLoop;
  private width = 180;
  private height = 500;
  private dpr = 1;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private overlayVisible = true;

  private cachedContainerRect: CachedRect | null = null;
  private cachedCanvasRect: CachedRect | null = null;
  private cachedDockRect: CachedRect | null = null;

  private placingDecoration: DecorationType | null = null;
  private pointerPos: { x: number; y: number } | null = null;
  private lastExternalOverlapAt = 0;

  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundDocClick: ((e: MouseEvent) => void) | null = null;
  private boundWindowPointerDown: ((e: PointerEvent) => void) | null = null;
  private boundWindowMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundWindowResize: (() => void) | null = null;
  private boundVisibilityChange: (() => void) | null = null;
  private visibilityDoc: Document | null = null;
  private readonly ownerDoc: Document;

  constructor(
    rootEl: HTMLElement,
    private host: WidgetHostActions,
  ) {
    this.ownerDoc = rootEl.ownerDocument;
    this.containerEl = rootEl.createDiv({
      cls: "side-tree-widget",
    });
    if (Platform.isMobile) {
      this.containerEl.addClass("is-mobile");
    }

    this.canvasEl = this.containerEl.createEl("canvas", {
      cls: "side-tree-canvas",
      attr: {
        "aria-hidden": "true",
      },
    });
    this.ctx = this.canvasEl.getContext("2d");

    this.dockMenu = new TreeDockMenu(rootEl, this.containerEl, {
      getSettings: () => this.host.getSettings(),
      getState: () => this.host.getState(),
      getSkeleton: () => this.ensureSkeleton(this.host.getSettings(), this.host.getState()),
      onWater: () => this.waterTree(),
      onStartPlacing: (type) => this.startPlacing(type),
      onCancelPlacing: () => this.cancelPlacing(),
      onClearDecorations: () => {
        this.host.updateState((s) => ({ ...s, decorations: [] }));
      },
      onDockLayoutChanged: () => {
        this.cachedDockRect = null;
      },
    });

    this.loop = new FixedStepLoop({
      intervalMs: SideTreeWidget.FRAME_INTERVAL_MS,
      canRun: () => this.shouldAnimate(),
      onStep: (dt) => this.renderFrame(dt),
    });

    this.bindEvents();
    this.refreshLabels();
    this.measureAndResize();
    this.loop.sync();
  }

  getSimulation(): TreeSimulation {
    return this.simulation;
  }

  notifyExternalOverlap(): void {
    this.lastExternalOverlapAt = Date.now();
  }

  getColliderSnapshot(): TreeColliderSnapshot | null {
    const settings = this.host.getSettings();
    if (!settings.enabled || !settings.tree.visible || !settings.treeWeatherInteractions) {
      return null;
    }
    const weather = this.host.getWeatherInput();
    if (
      !weather.enabled ||
      !weather.interactionsEnabled ||
      (!isRainyCondition(weather.condition) && weather.condition !== "snow")
    ) {
      return null;
    }
    const rect = this.cachedCanvasRect ?? this.updateCanvasRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const state = this.host.getState();
    const skeleton = this.ensureSkeleton(settings, state);
    if (!this.simulation.hasMaskReady(this.width, this.height)) {
      const season = resolveSeason(
        settings.tree.seasonOverride,
        new Date(),
        settings.location.latitude,
      );
      this.simulation.rebuildCollisionMask(
        this.width,
        this.height,
        skeleton,
        settings.tree.species,
        season,
      );
    }
    const latest = this.simulation.getCollisionMask();
    return {
      rect,
      boundingBox: this.simulation.getMaskBoundingBox() ?? skeleton.boundingBox,
      mask: latest.mask,
      maskW: latest.maskW,
      maskH: latest.maskH,
      onRainImpact: (normX: number, normY: number, windVx: number) => {
        this.lastExternalOverlapAt = Date.now();
        this.simulation.spawnRainImpactSplash(normX, normY, windVx);
      },
      onSnowImpact: (normX: number, normY: number) => {
        this.lastExternalOverlapAt = Date.now();
        this.simulation.onSnowImpact(normX, normY);
      },
    };
  }

  private updateCanvasRect(): CachedRect {
    const rect = toCachedRect(this.canvasEl.getBoundingClientRect());
    this.cachedCanvasRect = rect;
    return rect;
  }

  invalidateCachedRects(): void {
    this.cachedContainerRect = null;
    this.cachedCanvasRect = null;
    this.cachedDockRect = null;
  }

  private updateCachedRects(): void {
    this.cachedContainerRect = toCachedRect(this.containerEl.getBoundingClientRect());
    this.cachedCanvasRect = toCachedRect(this.canvasEl.getBoundingClientRect());
    this.cachedDockRect = this.dockMenu.getDockRect();
  }

  triggerWatering(): void {
    const settings = this.host.getSettings();
    const state = this.host.getState();
    const skeleton = this.ensureSkeleton(settings, state);
    this.simulation.triggerWateringCan(skeleton);
    this.simulation.spawnWaterSplash(skeleton.trunkBaseX, skeleton.groundY);
  }

  refreshLabels(): void {
    this.dockMenu.refreshLabels();
  }

  private waterTree(): void {
    const settings = this.host.getSettings();
    this.host.updateState((s) =>
      applyWatering(s, settings.tree.growthSpeedMultiplier),
    );
    this.triggerWatering();
  }

  private petTree(): void {
    const settings = this.host.getSettings();
    const state = this.host.getState();
    const skeleton = this.ensureSkeleton(settings, state);
    const season = resolveSeason(
      settings.tree.seasonOverride,
      new Date(),
      settings.location.latitude,
    );
    this.simulation.triggerShake(1.0);
    this.simulation.spawnShakeBurst(skeleton, season, settings.tree.species);
    this.simulation.disturbVisitors();
  }

  private startPlacing(type: DecorationType): void {
    this.placingDecoration = type;
    this.dockMenu.setPlacingMode(true);
  }

  private cancelPlacing(): void {
    if (!this.placingDecoration) return;
    this.placingDecoration = null;
    this.pointerPos = null;
    this.dockMenu.setPlacingMode(false);
  }

  private bindEvents(): void {
    this.resizeObserver = new ResizeObserver(() => this.measureAndResize());
    this.resizeObserver.observe(this.containerEl);

    const updatePointerPos = (clientX: number, clientY: number) => {
      const rect = this.cachedCanvasRect ?? this.updateCanvasRect();
      this.pointerPos = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    this.canvasEl.addEventListener("mousemove", (e) => {
      updatePointerPos(e.clientX, e.clientY);
    });

    this.canvasEl.addEventListener("pointerdown", (e) => {
      updatePointerPos(e.clientX, e.clientY);
      if (e.pointerType === "touch") {
        this.dockMenu.setTouchDockVisible(true);
      }
    });

    this.canvasEl.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") {
        updatePointerPos(e.clientX, e.clientY);
      }
    });

    this.canvasEl.addEventListener("mouseleave", () => {
      this.pointerPos = null;
    });

    this.canvasEl.addEventListener("contextmenu", (e) => {
      if (this.placingDecoration) {
        e.preventDefault();
        this.cancelPlacing();
      }
    });

    this.canvasEl.addEventListener("click", (e) => this.onCanvasClick(e));

    this.boundKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.cancelPlacing();
        this.dockMenu.setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", this.boundKeyDown);

    this.boundWindowPointerDown = (e: PointerEvent) => {
      const settings = this.host.getSettings();
      if (!settings.tree.visible) return;
      if (e.pointerType !== "touch") return;
      const rect = this.cachedContainerRect ?? this.cachedCanvasRect ?? this.updateCanvasRect();
      if (isPointInRect(e.clientX, e.clientY, rect)) {
        this.dockMenu.setTouchDockVisible(true);
      } else if (!this.dockMenu.menuOpen && !this.placingDecoration) {
        this.dockMenu.setTouchDockVisible(false);
      }
    };
    window.addEventListener("pointerdown", this.boundWindowPointerDown, {
      passive: true,
    });

    this.boundDocClick = (e: MouseEvent) => {
      const targetNode = e.target as Node | null;
      if (this.dockMenu.menuOpen && !this.dockMenu.containsNode(targetNode)) {
        this.dockMenu.setMenuOpen(false);
      }

      const settings = this.host.getSettings();
      if (!settings.tree.visible) return;

      if (
        e.target === this.canvasEl ||
        this.placingDecoration !== null ||
        this.dockMenu.containsNode(targetNode)
      ) {
        return;
      }

      const targetEl = targetNode?.instanceOf(Element) ? targetNode : null;
      if (targetEl?.closest(IGNORED_CLICK_ANCESTOR_SELECTOR)) {
        return;
      }

      const rect = this.cachedCanvasRect ?? this.updateCanvasRect();
      if (isPointInRect(e.clientX, e.clientY, rect)) {
        const inActualText = Boolean(
          targetEl?.closest(".cm-content, .markdown-preview-section"),
        );
        this.handleInteractionAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          {
            allowDecoRemoval: !inActualText || e.altKey,
            allowTreePet: !inActualText || e.altKey,
            skipNearCheck: false,
          },
        );
      }
    };

    this.boundWindowMouseMove = (e: MouseEvent) => {
      const settings = this.host.getSettings();
      if (!settings.tree.visible || this.ownerDoc.hidden) return;

      if (this.dockMenu.menuOpen || this.placingDecoration !== null) {
        this.containerEl.addClass("is-hovered");
        return;
      }
      if (!this.cachedContainerRect || !this.cachedDockRect) {
        this.updateCachedRects();
      }
      const rect = this.cachedContainerRect;
      if (!isPointInRect(e.clientX, e.clientY, rect)) {
        this.dockMenu.setHoverState(false);
        return;
      }

      const localX = e.clientX - rect!.left;
      const localY = e.clientY - rect!.top;
      let overTree = false;
      if (this.skeleton) {
        const b = this.skeleton.boundingBox;
        overTree =
          localX >= b.minX - 16 &&
          localX <= b.maxX + 16 &&
          localY >= b.minY - 16 &&
          localY <= this.height;
      }
      if (!overTree) {
        overTree = isPointInRect(e.clientX, e.clientY, this.cachedDockRect, 8);
      }
      this.dockMenu.setHoverState(overTree);
    };
    window.addEventListener("mousemove", this.boundWindowMouseMove, {
      passive: true,
    });

    this.boundWindowResize = () => {
      this.invalidateCachedRects();
    };
    window.addEventListener("resize", this.boundWindowResize, {
      passive: true,
    });

    this.boundVisibilityChange = () => {
      this.loop.sync();
    };
    this.visibilityDoc = this.ownerDoc;
    this.visibilityDoc.addEventListener("visibilitychange", this.boundVisibilityChange);

    window.addEventListener("click", this.boundDocClick);
  }

  private isPointNearTree(x: number, y: number): boolean {
    if (!this.skeleton) return false;
    const b = this.skeleton.boundingBox;
    return (
      x >= b.minX - 10 &&
      x <= b.maxX + 10 &&
      y >= b.minY - 10 &&
      y <= b.maxY + 6
    );
  }

  private handleInteractionAt(
    x: number,
    y: number,
    opts: {
      allowDecoRemoval: boolean;
      allowTreePet: boolean;
      skipNearCheck: boolean;
    },
  ): void {
    const settings = this.host.getSettings();
    const state = this.host.getState();

    if (opts.allowDecoRemoval) {
      const hitDeco = hitTestDecoration(
        state.decorations,
        this.width,
        this.height,
        x,
        y,
      );
      if (hitDeco) {
        this.host.updateState((s) => ({
          ...s,
          decorations: s.decorations.filter((d) => d.id !== hitDeco.id),
        }));
        return;
      }
    }

    const visitor = this.simulation.hitTestVisitor(x, y);
    if (visitor) {
      this.simulation.interactVisitor(visitor);
      this.host.updateState((s) => ({
        ...s,
        visitorInteractions: s.visitorInteractions + 1,
        growthHours:
          s.growthHours + 0.015 * Math.min(settings.tree.growthSpeedMultiplier, 10),
      }));
      return;
    }

    if (opts.allowTreePet && (opts.skipNearCheck || this.isPointNearTree(x, y))) {
      this.petTree();
    }
  }

  private onCanvasClick(e: MouseEvent): void {
    e.stopPropagation();
    const rect = this.cachedCanvasRect ?? this.updateCanvasRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const settings = this.host.getSettings();

    if (this.placingDecoration) {
      const type = this.placingDecoration;
      const state = this.host.getState();
      const skeleton = this.ensureSkeleton(settings, state);
      const anchor = findNearestBranchAnchor(skeleton, x, y);
      const px = anchor ? anchor.x : x;
      const py = anchor ? anchor.y : y;
      const newDeco: PlacedDecoration = {
        id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        normX: clamp(px / Math.max(1, this.width), 0.03, 0.97),
        normY: clamp(py / Math.max(1, this.height), 0.03, 0.97),
        ...(anchor ? { branchId: anchor.branchId, branchT: anchor.branchT } : {}),
      };
      this.host.updateState((s) => ({
        ...s,
        decorations: placeDecorationWithCaps(s.decorations, newDeco),
      }));
      this.cancelPlacing();
      return;
    }

    this.handleInteractionAt(x, y, {
      allowDecoRemoval: true,
      allowTreePet: true,
      skipNearCheck: true,
    });
  }

  measureAndResize(): void {
    const rect = this.containerEl.getBoundingClientRect();
    const w = Math.max(120, Math.floor(rect.width));
    const h = Math.max(160, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetCanvasW = Math.floor(w * dpr);
    const targetCanvasH = Math.floor(h * dpr);

    if (
      w !== this.width ||
      h !== this.height ||
      dpr !== this.dpr ||
      this.canvasEl.width !== targetCanvasW ||
      this.canvasEl.height !== targetCanvasH
    ) {
      this.width = w;
      this.height = h;
      this.dpr = dpr;
      this.canvasEl.width = targetCanvasW;
      this.canvasEl.height = targetCanvasH;
    }
    this.cachedContainerRect = toCachedRect(rect);
    this.cachedCanvasRect = toCachedRect(this.canvasEl.getBoundingClientRect());
    this.cachedDockRect = this.dockMenu.getDockRect();
  }

  onVisibilityChanged(visible: boolean): void {
    this.overlayVisible = visible;
    if (!visible) {
      this.cancelPlacing();
      this.dockMenu.setMenuOpen(false);
      this.dockMenu.setTouchDockVisible(false);
      this.pointerPos = null;
    } else {
      this.invalidateCachedRects();
      this.measureAndResize();
    }
    this.loop.sync();
  }

  private shouldAnimate(): boolean {
    const settings = this.host.getSettings();
    return !this.destroyed && this.overlayVisible && settings.tree.visible && !this.ownerDoc.hidden;
  }

  private ensureSkeleton(
    settings: PixelWeatherSettings,
    state: TreeState,
  ): TreeSkeleton {
    const growthStep = Math.round(state.growthHours * 100);
    if (
      !this.skeleton ||
      state.seed !== this.lastSkelSeed ||
      growthStep !== this.lastSkelGrowthStep ||
      settings.tree.species !== this.lastSkelSpecies ||
      this.width !== this.lastSkelWidth ||
      this.height !== this.lastSkelHeight ||
      settings.tree.overlaySide !== this.lastSkelSide
    ) {
      const nextSkeleton = generateTreeSkeleton({
        seed: state.seed,
        growthHours: state.growthHours,
        species: settings.tree.species,
        width: this.width,
        height: this.height,
        anchorSide: settings.tree.overlaySide,
      });
      this.skeleton = nextSkeleton;
      this.lastSkelSeed = state.seed;
      this.lastSkelGrowthStep = growthStep;
      this.lastSkelSpecies = settings.tree.species;
      this.lastSkelWidth = this.width;
      this.lastSkelHeight = this.height;
      this.lastSkelSide = settings.tree.overlaySide;

      if (state.decorations.length > 0) {
        const updated = repositionDecorationsToBranches(
          state.decorations,
          nextSkeleton,
          this.width,
          this.height,
        );
        let changed = updated.length !== state.decorations.length;
        if (!changed) {
          for (let i = 0; i < updated.length; i++) {
            const a = state.decorations[i];
            const b = updated[i];
            if (
              Math.abs(a.normX - b.normX) > 1e-4 ||
              Math.abs(a.normY - b.normY) > 1e-4 ||
              a.branchId !== b.branchId ||
              a.branchT !== b.branchT
            ) {
              changed = true;
              break;
            }
          }
        }
        if (changed) {
          this.host.updateState((s) => ({
            ...s,
            decorations: repositionDecorationsToBranches(
              s.decorations,
              nextSkeleton,
              this.width,
              this.height,
            ),
          }));
        }
      }
    }
    return this.skeleton;
  }

  private renderFrame(dt: number): void {
    if (!this.ctx) return;

    const settings = this.host.getSettings();
    const state = this.host.getState();
    const weather = this.host.getWeatherInput();
    const hasRecentExternalOverlap = Date.now() - this.lastExternalOverlapAt < 450;
    const weatherWithOverlap: TreeWeatherInput = {
      ...weather,
      hasExternalOverlap: hasRecentExternalOverlap,
    };

    const nowDate = new Date();
    const season = resolveSeason(
      settings.tree.seasonOverride,
      nowDate,
      settings.location.latitude,
    );
    const timeOfDay = resolveTimeOfDay(
      settings.tree.timeOfDayOverride,
      nowDate,
      weather.enabled && settings.treeWeatherInteractions ? weather.condition : undefined,
      weather.enabled && settings.treeWeatherInteractions ? this.host.getWeatherIsDay() : undefined,
      settings.location.timezone,
      settings.location.longitude,
    );
    const skeleton = this.ensureSkeleton(settings, state);

    this.simulation.step(
      dt,
      this.width,
      this.height,
      skeleton,
      settings.tree.species,
      season,
      timeOfDay,
      weatherWithOverlap,
      settings.tree.visitorFrequency,
      state.decorations,
    );

    const isLightTheme = this.ownerDoc.body.classList.contains("theme-light");
    this.ctx.save();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.simulation.render(this.ctx, this.width, this.height, {
      skeleton,
      species: settings.tree.species,
      season,
      timeOfDay,
      weather: weatherWithOverlap,
      decorations: state.decorations,
      placingDecoration: this.placingDecoration,
      pointerPos: this.pointerPos,
      isLightTheme,
    });
    this.ctx.restore();

    this.dockMenu.updateStatus(settings, state, this.skeleton);
    this.dockMenu.updateThirstyIndicator(settings, state);
  }

  destroy(): void {
    this.destroyed = true;
    this.loop.stop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.boundKeyDown) {
      window.removeEventListener("keydown", this.boundKeyDown);
      this.boundKeyDown = null;
    }
    if (this.boundWindowPointerDown) {
      window.removeEventListener("pointerdown", this.boundWindowPointerDown);
      this.boundWindowPointerDown = null;
    }
    if (this.boundDocClick) {
      window.removeEventListener("click", this.boundDocClick);
      this.boundDocClick = null;
    }
    if (this.boundWindowMouseMove) {
      window.removeEventListener("mousemove", this.boundWindowMouseMove);
      this.boundWindowMouseMove = null;
    }
    if (this.boundWindowResize) {
      window.removeEventListener("resize", this.boundWindowResize);
      this.boundWindowResize = null;
    }
    if (this.boundVisibilityChange && this.visibilityDoc) {
      this.visibilityDoc.removeEventListener("visibilitychange", this.boundVisibilityChange);
      this.boundVisibilityChange = null;
      this.visibilityDoc = null;
    }
    this.containerEl.remove();
  }
}
