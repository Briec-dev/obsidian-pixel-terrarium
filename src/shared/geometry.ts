export interface CachedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function toCachedRect(
  domRect: Pick<CachedRect, "left" | "top" | "right" | "bottom" | "width" | "height">,
): CachedRect {
  return {
    left: domRect.left,
    top: domRect.top,
    right: domRect.right,
    bottom: domRect.bottom,
    width: domRect.width,
    height: domRect.height,
  };
}

export function isPointInRect(
  x: number,
  y: number,
  rect: CachedRect | null | undefined,
  pad = 0,
): boolean {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  return (
    x >= rect.left - pad &&
    x <= rect.right + pad &&
    y >= rect.top - pad &&
    y <= rect.bottom + pad
  );
}
