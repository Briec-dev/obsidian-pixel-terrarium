import { Platform, setIcon } from "obsidian";
import { formatTemplate, getStageLabel, getTranslations } from "../i18n";
import { toCachedRect, type CachedRect } from "../shared/geometry";
import type {
  DecorationType,
  PixelWeatherSettings,
  TreeSkeleton,
  TreeState,
} from "../types";

export interface DockMenuCallbacks {
  getSettings: () => PixelWeatherSettings;
  getState: () => TreeState;
  getSkeleton: () => TreeSkeleton;
  onWater: () => void;
  onStartPlacing: (type: DecorationType) => void;
  onCancelPlacing: () => void;
  onClearDecorations: () => void;
  onDockLayoutChanged: () => void;
}

/**
 * Manages the hover-revealed dock bar and popover action menu for SideTreeWidget.
 */
export class TreeDockMenu {
  readonly controlsDockEl: HTMLElement;
  private readonly menuToggleBtn: HTMLButtonElement;
  private readonly cancelPlaceBtn: HTMLButtonElement;
  private readonly cancelPlaceLabelEl: HTMLElement;
  private readonly popoverEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly thirstyDotEl: HTMLElement;

  menuOpen = false;
  private lastStatusText = "";
  private lastIsThirsty: boolean | null = null;
  private lastThirstyLabel = "";

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly containerEl: HTMLElement,
    private readonly callbacks: DockMenuCallbacks,
  ) {
    this.controlsDockEl = this.containerEl.createDiv({
      cls: Platform.isMobile ? "side-tree-dock is-visible" : "side-tree-dock",
    });

    this.cancelPlaceBtn = this.controlsDockEl.createEl("button", {
      cls: "side-tree-cancel-btn is-hidden",
      type: "button",
    });
    const cancelIcon = this.cancelPlaceBtn.createSpan({
      cls: "side-tree-cancel-icon",
    });
    setIcon(cancelIcon, "x");
    this.cancelPlaceLabelEl = this.cancelPlaceBtn.createSpan({
      cls: "side-tree-cancel-label",
    });

    this.thirstyDotEl = this.controlsDockEl.createDiv({
      cls: "side-tree-thirsty-badge is-hidden",
      attr: {
        "aria-hidden": "true",
      },
    });
    setIcon(this.thirstyDotEl, "droplet");

    this.menuToggleBtn = this.controlsDockEl.createEl("button", {
      cls: "side-tree-dock-btn",
      type: "button",
      attr: {
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        "aria-controls": "side-tree-popover-menu",
      },
    });
    setIcon(this.menuToggleBtn, "trees");

    this.popoverEl = this.containerEl.createDiv({
      cls: "side-tree-popover is-hidden",
      attr: {
        id: "side-tree-popover-menu",
        role: "menu",
        "aria-hidden": "true",
      },
    });
    this.statusEl = this.popoverEl.createDiv({
      cls: "side-tree-popover-status",
    });

    this.cancelPlaceBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onCancelPlacing();
    });

    this.menuToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setMenuOpen(!this.menuOpen);
    });

    this.buildPopover();
    this.refreshLabels();
  }

  containsNode(node: Node | null): boolean {
    if (!node) return false;
    return this.popoverEl.contains(node) || this.controlsDockEl.contains(node);
  }

  getDockRect(): CachedRect {
    return toCachedRect(this.controlsDockEl.getBoundingClientRect());
  }

  refreshLabels(): void {
    const settings = this.callbacks.getSettings();
    const t = getTranslations(settings.language).tree;
    this.menuToggleBtn.setAttr("aria-label", t.menuTooltip);
    this.cancelPlaceBtn.setAttr("aria-label", t.cancelPlacingTooltip);
    this.cancelPlaceLabelEl.setText(t.cancelPlacing);
    this.lastStatusText = "";
    this.lastThirstyLabel = "";
    this.buildPopover();
  }

  buildPopover(): void {
    const items = this.popoverEl.querySelectorAll(".side-tree-menu-item");
    items.forEach((el) => el.remove());

    const settings = this.callbacks.getSettings();
    const state = this.callbacks.getState();
    const t = getTranslations(settings.language).tree;

    const addItem = (icon: string, label: string, onClick: () => void) => {
      const btn = this.popoverEl.createEl("button", {
        cls: "side-tree-menu-item",
        type: "button",
        attr: {
          role: "menuitem",
        },
      });
      const iconSpan = btn.createSpan({ cls: "side-tree-menu-icon" });
      setIcon(iconSpan, icon);
      btn.createSpan({ text: label, cls: "side-tree-menu-label" });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setMenuOpen(false);
        onClick();
      });
    };

    // 1. Water
    addItem("droplet", t.water, () => this.callbacks.onWater());

    // 2. Decorations
    addItem("flame", t.placeLantern, () => this.callbacks.onStartPlacing("lantern"));
    addItem("home", t.placeBirdhouse, () => this.callbacks.onStartPlacing("birdhouse"));

    if (state.decorations.length > 0) {
      addItem("trash-2", t.clearDecorations, () => {
        this.callbacks.onClearDecorations();
        this.buildPopover();
      });
    }

    // 3. Info (always placed at the very bottom of the menu)
    this.statusEl.toggleClass("is-hidden", !settings.tree.showSoilInfo);
    this.statusEl.remove();
    this.popoverEl.appendChild(this.statusEl);
  }

  setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    if (open) {
      this.buildPopover();
      const settings = this.callbacks.getSettings();
      const state = this.callbacks.getState();
      const skeleton = this.callbacks.getSkeleton();
      this.updateStatus(settings, state, skeleton);
    }
    this.containerEl.toggleClass("is-menu-open", open);
    this.popoverEl.toggleClass("is-hidden", !open);
    this.popoverEl.setAttr("aria-hidden", String(!open));
    this.menuToggleBtn.toggleClass("is-active", open);
    this.menuToggleBtn.setAttr("aria-expanded", String(open));
    if (!open && !Platform.isMobile) {
      this.controlsDockEl.removeClass("is-visible");
    }
    this.callbacks.onDockLayoutChanged();
  }

  setPlacingMode(active: boolean): void {
    this.rootEl.toggleClass("is-placing", active);
    this.containerEl.toggleClass("is-placing", active);
    this.cancelPlaceBtn.toggleClass("is-hidden", !active);
    this.callbacks.onDockLayoutChanged();
  }

  setTouchDockVisible(visible: boolean): void {
    if (visible) {
      this.containerEl.addClass("is-hovered");
      this.controlsDockEl.addClass("is-visible");
    } else if (!Platform.isMobile) {
      this.containerEl.removeClass("is-hovered");
      this.controlsDockEl.removeClass("is-visible");
    }
  }

  setHoverState(hovered: boolean): void {
    this.containerEl.toggleClass("is-hovered", hovered);
    if (!hovered && !Platform.isMobile) {
      this.controlsDockEl.removeClass("is-visible");
    }
  }

  updateStatus(
    settings: PixelWeatherSettings,
    state: TreeState,
    skeleton: TreeSkeleton | null,
  ): void {
    if (!settings.tree.showSoilInfo || !this.menuOpen || !skeleton) return;
    const tr = getTranslations(settings.language).tree;
    const nextStatus = formatTemplate(tr.statsFormat, {
      stage: getStageLabel(settings.language, skeleton.stage),
      hours: state.growthHours.toFixed(1),
      moisture: Math.round(state.moisture),
    });
    if (nextStatus !== this.lastStatusText) {
      this.lastStatusText = nextStatus;
      this.statusEl.setText(nextStatus);
    }
  }

  updateThirstyIndicator(settings: PixelWeatherSettings, state: TreeState): void {
    const isThirsty = state.moisture < 30;
    if (isThirsty !== this.lastIsThirsty) {
      this.lastIsThirsty = isThirsty;
      this.thirstyDotEl.toggleClass("is-hidden", !isThirsty);
    }
    if (isThirsty) {
      const tr = getTranslations(settings.language).tree;
      if (tr.thirstyHint !== this.lastThirstyLabel) {
        this.lastThirstyLabel = tr.thirstyHint;
        this.thirstyDotEl.setAttr("aria-label", tr.thirstyHint);
      }
    }
  }
}
