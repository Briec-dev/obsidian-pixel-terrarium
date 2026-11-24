import type { CachedRect } from "../shared/geometry";

export interface TreeColliderBounds {
  rect: CachedRect;
  boundingBox?: { minX: number; minY: number; maxX: number; maxY: number };
  mask: Uint8Array;
  maskW: number;
  maskH: number;
  onRainImpact: (normX: number, normY: number, windVx: number) => void;
  onSnowImpact?: (normX: number, normY: number) => void;
}

export interface TreeCollisionTarget {
  mask: Uint8Array;
  maskW: number;
  maskH: number;
  scaleX: number;
  offsetX: number;
  scaleY: number;
  offsetY: number;
  onRainImpact: (normX: number, normY: number, windVx: number) => void;
  onSnowImpact?: (normX: number, normY: number) => void;
}

export interface TreeRainCollisionBox {
  mask: Uint8Array;
  maskW: number;
  maskH: number;
  scaleX: number;
  offsetX: number;
  scaleY: number;
  offsetY: number;
  minGx: number;
  maxGx: number;
  minGy: number;
  maxGy: number;
}

export function buildTreeCollisionTarget(
  tree: TreeColliderBounds,
  paneRect: CachedRect,
  gridW: number,
  gridH: number,
): TreeCollisionTarget | null {
  if (
    paneRect.width <= 0 ||
    paneRect.height <= 0 ||
    tree.rect.width <= 0 ||
    tree.rect.height <= 0 ||
    tree.maskW <= 0 ||
    tree.maskH <= 0 ||
    gridW <= 0 ||
    gridH <= 0
  ) {
    return null;
  }

  let activeLeft: number;
  let activeRight: number;
  let activeTop: number;
  let activeBottom: number;

  if (tree.boundingBox) {
    activeLeft = tree.rect.left + tree.boundingBox.minX;
    activeRight = tree.rect.left + tree.boundingBox.maxX;
    activeTop = tree.rect.top + tree.boundingBox.minY;
    activeBottom = tree.rect.top + tree.boundingBox.maxY;
  } else {
    const { mask, maskW, maskH } = tree;
    let minMx = maskW;
    let maxMx = -1;
    let minMy = maskH;
    let maxMy = -1;
    for (let my = 0; my < maskH; my++) {
      const rowBase = my * maskW;
      for (let mx = 0; mx < maskW; mx++) {
        if (mask[rowBase + mx] > 0) {
          if (mx < minMx) minMx = mx;
          if (mx > maxMx) maxMx = mx;
          if (my < minMy) minMy = my;
          if (my > maxMy) maxMy = my;
        }
      }
    }
    if (maxMx < minMx || maxMy < minMy) {
      return null;
    }
    activeLeft = tree.rect.left + (minMx / maskW) * tree.rect.width;
    activeRight = tree.rect.left + ((maxMx + 1) / maskW) * tree.rect.width;
    activeTop = tree.rect.top + (minMy / maskH) * tree.rect.height;
    activeBottom = tree.rect.top + ((maxMy + 1) / maskH) * tree.rect.height;
  }

  const overlaps =
    paneRect.right > activeLeft &&
    paneRect.left < activeRight &&
    paneRect.bottom > activeTop &&
    paneRect.top < activeBottom;

  if (!overlaps) {
    return null;
  }

  return {
    mask: tree.mask,
    maskW: tree.maskW,
    maskH: tree.maskH,
    scaleX: (paneRect.width / gridW) * (tree.maskW / tree.rect.width),
    offsetX: ((paneRect.left - tree.rect.left) / tree.rect.width) * tree.maskW,
    scaleY: (paneRect.height / gridH) * (tree.maskH / tree.rect.height),
    offsetY: ((paneRect.top - tree.rect.top) / tree.rect.height) * tree.maskH,
    onRainImpact: tree.onRainImpact,
    onSnowImpact: tree.onSnowImpact,
  };
}

export function checkTreeCollision(
  tree: TreeCollisionTarget,
  gx: number,
  gy: number,
): { mx: number; my: number; cell: number } | null {
  const mx = Math.floor(gx * tree.scaleX + tree.offsetX);
  const my = Math.floor(gy * tree.scaleY + tree.offsetY);
  if (mx < 0 || mx >= tree.maskW || my < 0 || my >= tree.maskH) {
    return null;
  }
  const cell = tree.mask[my * tree.maskW + mx];
  if (cell === 0) return null;
  return { mx, my, cell };
}

export function buildTreeRainCollisionBox(
  treeCollider: TreeCollisionTarget | null,
): TreeRainCollisionBox | null {
  if (!treeCollider || treeCollider.scaleX <= 0 || treeCollider.scaleY <= 0) {
    return null;
  }
  return {
    mask: treeCollider.mask,
    maskW: treeCollider.maskW,
    maskH: treeCollider.maskH,
    scaleX: treeCollider.scaleX,
    offsetX: treeCollider.offsetX,
    scaleY: treeCollider.scaleY,
    offsetY: treeCollider.offsetY,
    minGx: -treeCollider.offsetX / treeCollider.scaleX,
    maxGx: (treeCollider.maskW - treeCollider.offsetX) / treeCollider.scaleX,
    minGy: -treeCollider.offsetY / treeCollider.scaleY,
    maxGy: (treeCollider.maskH - treeCollider.offsetY) / treeCollider.scaleY,
  };
}

function hitMaskAtGrid(
  box: TreeRainCollisionBox,
  gx: number,
  gy: number,
): { mx: number; my: number } | null {
  const my = Math.floor(gy * box.scaleY + box.offsetY);
  if (my < 0 || my >= box.maskH) {
    return null;
  }
  const colX = Math.floor(gx);
  const mx0 = Math.max(0, Math.floor(colX * box.scaleX + box.offsetX));
  const mx1 = Math.min(
    box.maskW - 1,
    Math.floor((colX + 0.999) * box.scaleX + box.offsetX),
  );
  const rowBase = my * box.maskW;
  for (let mx = mx0; mx <= mx1; mx++) {
    if (box.mask[rowBase + mx] !== 0) {
      return { mx, my };
    }
  }
  return null;
}

/**
 * Swept raycast across a raindrop's vertical step and body pixels so 100% of
 * raindrops colliding with bark or foliage explode on impact and never pass through.
 */
export function traceRaindropAgainstTree(
  box: TreeRainCollisionBox,
  treeCollider: TreeCollisionTarget,
  prevX: number,
  prevY: number,
  dropX: number,
  dropY: number,
  dropVx: number,
  dropLen: number,
): "miss" | "reset" {
  const slant = dropVx > 8 ? 1 : dropVx < -8 ? -1 : 0;
  const slantOff = Math.floor((slant * dropLen) / 2);
  const prevTipX = prevX + slantOff;
  const prevTipY = prevY + dropLen;
  const tipX = dropX + slantOff;
  const tipY = dropY + dropLen;

  const minX = Math.min(prevX, prevTipX, dropX, tipX);
  const maxX = Math.max(prevX, prevTipX, dropX, tipX) + 1;
  const minY = Math.min(prevY, dropY);
  const maxY = Math.max(prevTipY, tipY);

  if (
    maxX < box.minGx ||
    minX > box.maxGx ||
    maxY < box.minGy ||
    minY > box.maxGy
  ) {
    return "miss";
  }

  const mStartX = prevTipX * box.scaleX + box.offsetX;
  const mStartY = prevTipY * box.scaleY + box.offsetY;
  const mEndX = tipX * box.scaleX + box.offsetX;
  const mEndY = tipY * box.scaleY + box.offsetY;
  const dmx = mEndX - mStartX;
  const dmy = mEndY - mStartY;
  const steps = Math.min(
    24,
    Math.max(1, Math.ceil(Math.max(Math.abs(dmx), Math.abs(dmy)) * 1.25)),
  );
  const invSteps = 1 / steps;

  let hit: { mx: number; my: number } | null = null;
  for (let s = 0; s <= steps; s++) {
    const t = s * invSteps;
    const gx = prevTipX + (tipX - prevTipX) * t;
    const gy = prevTipY + (tipY - prevTipY) * t;
    hit = hitMaskAtGrid(box, gx, gy);
    if (hit) break;
  }

  if (!hit) {
    const baseDropX = Math.floor(dropX);
    for (let i = 0; i < dropLen; i++) {
      const gx = baseDropX + Math.floor((slant * i) / 2);
      const gy = dropY + i;
      hit = hitMaskAtGrid(box, gx, gy);
      if (hit) break;
    }
  }

  if (!hit) {
    return "miss";
  }

  treeCollider.onRainImpact(
    (hit.mx + 0.5) / box.maskW,
    (hit.my + 0.5) / box.maskH,
    dropVx,
  );
  return "reset";
}

export function checkSnowflakeAgainstTree(
  treeCollider: TreeCollisionTarget,
  flakeX: number,
  flakeY: number,
  rng: () => number,
): "miss" | "reset" | "pass" {
  const hit = checkTreeCollision(treeCollider, flakeX, flakeY);
  if (!hit) return "miss";

  const aboveEmpty =
    hit.my === 0 ||
    treeCollider.mask[(hit.my - 1) * treeCollider.maskW + hit.mx] === 0;
  if (aboveEmpty || rng() < 0.3) {
    treeCollider.onSnowImpact?.(
      (hit.mx + 0.5) / treeCollider.maskW,
      (hit.my + 0.5) / treeCollider.maskH,
    );
    if (rng() < 0.6) {
      return "reset";
    }
  }
  return "pass";
}
