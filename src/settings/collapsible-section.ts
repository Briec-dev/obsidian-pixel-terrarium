export interface CollapsibleSectionOptions {
  title: string;
  isActive: boolean;
  activeLabel: string;
  inactiveLabel: string;
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
}

export interface CollapsibleSectionRefs {
  detailsEl: HTMLDetailsElement;
  bodyEl: HTMLElement;
}

/**
 * Renders a collapsible `<details>` settings section with a chevron, section title,
 * and an active/inactive status pill in the summary header.
 */
export function createCollapsibleSection(
  containerEl: HTMLElement,
  opts: CollapsibleSectionOptions,
): CollapsibleSectionRefs {
  const detailsEl = containerEl.createEl("details", {
    cls: "pixel-weather-section-details",
  });
  detailsEl.open = opts.isOpen;

  const summaryEl = detailsEl.createEl("summary", {
    cls: "pixel-weather-section-summary",
  });
  const titleGroup = summaryEl.createSpan({
    cls: "pixel-weather-section-title-group",
  });
  titleGroup.createSpan({
    cls: "pixel-weather-section-chevron",
    text: "▸",
    attr: { "aria-hidden": "true" },
  });
  titleGroup.createSpan({
    cls: "pixel-weather-section-title-text",
    text: opts.title,
  });

  summaryEl.createSpan({
    cls: `pixel-weather-section-status ${opts.isActive ? "is-active" : ""}`,
    text: opts.isActive ? opts.activeLabel : opts.inactiveLabel,
  });

  detailsEl.addEventListener("toggle", () => {
    opts.onToggleOpen(Boolean(detailsEl.open));
  });

  const bodyEl = detailsEl.createDiv({
    cls: "pixel-weather-section-body",
  });

  return { detailsEl, bodyEl };
}
