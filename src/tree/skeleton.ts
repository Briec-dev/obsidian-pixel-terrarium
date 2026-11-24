import { clamp, createRng, hashString, lerp } from "../shared/math";
import type {
  BranchNode,
  OverlaySide,
  PlacedDecoration,
  TreeSkeleton,
  TreeSpecies,
} from "../types";
import { computeMaturity, getTreeStage } from "./growth";

export interface SkeletonOptions {
  seed: number;
  growthHours: number;
  species: TreeSpecies;
  width: number;
  height: number;
  anchorSide: OverlaySide;
}

function clampBranchEndpoint(
  x1: number,
  y1: number,
  rawX2: number,
  rawY2: number,
  edgeMargin: number,
  width: number,
  groundY: number,
): { x2: number; y2: number; angle: number; length: number } {
  const minXBound = Math.min(edgeMargin, width / 2);
  const maxXBound = Math.max(minXBound, width - edgeMargin);
  const x2 = clamp(rawX2, minXBound, maxXBound);

  const maxYBound = Math.max(4, groundY - edgeMargin);
  const minYBound = Math.min(edgeMargin + 4, maxYBound);
  const y2 = clamp(rawY2, minYBound, maxYBound);

  const dx = x2 - x1;
  const dy = y2 - y1;
  return {
    x2,
    y2,
    angle: Math.atan2(dy, dx),
    length: Math.sqrt(dx * dx + dy * dy),
  };
}

/**
 * Generates a deterministic procedural tree starting directly at the bottom bar
 * (no soil mound) and keeping all foliage strictly inside the canvas bounds.
 */
export function generateTreeSkeleton(opts: SkeletonOptions): TreeSkeleton {
  const { seed, growthHours, species, width, height, anchorSide } = opts;

  const stage = getTreeStage(growthHours);
  const maturity = computeMaturity(growthHours);
  const groundY = Math.max(40, height - 6);

  const trunkBaseX = anchorSide === "right" ? width * 0.82 : width * 0.18;

  const cappedMaturity = clamp(maturity, 0.04, 1.45);
  const heightFraction = clamp(
    0.09 + Math.pow(cappedMaturity, 0.85) * 0.66,
    0.09,
    0.85,
  );

  const usableHeight = Math.max(40, groundY - 32);
  const targetHeight = usableHeight * heightFraction;
  const maxWidthHalf = Math.max(28, width * 0.38);

  const branches: BranchNode[] = [];
  let minX = trunkBaseX - 8;
  let maxX = trunkBaseX + 8;
  let minY = groundY - 8;
  const maxY = groundY;

  const inwardLean = anchorSide === "right" ? -0.05 : 0.05;

  const maxDepth =
    stage === "sprout"
      ? 1
      : stage === "seedling"
        ? 2
        : stage === "sapling"
          ? 3
          : stage === "young"
            ? 4
            : 5;

  const trunkSegments = stage === "sprout" ? 2 : stage === "seedling" ? 3 : 4;
  const baseThickness = clamp(
    2.6 + maturity * 9.5,
    2.6,
    Math.min(18, width * 0.1),
  );

  let curX = trunkBaseX;
  let curY = groundY;
  let curAngle = -Math.PI / 2 + inwardLean * 0.5;
  const trunkTotalLen =
    species === "pine" ? targetHeight * 0.9 : targetHeight * 0.6;
  const segLen = trunkTotalLen / trunkSegments;

  const trunkTips: Array<{
    id: string;
    x: number;
    y: number;
    angle: number;
    thickness: number;
  }> = [];

  for (let i = 0; i < trunkSegments; i++) {
    const id = `t${i}`;
    const rng = createRng(hashString(id, seed));
    const wobble = (rng() - 0.5) * (species === "pine" ? 0.06 : 0.14);
    curAngle = clamp(
      curAngle + wobble + inwardLean * 0.2,
      -Math.PI / 2 - 0.32,
      -Math.PI / 2 + 0.32,
    );

    const t0 = i / trunkSegments;
    const t1 = (i + 1) / trunkSegments;
    const thick0 = lerp(baseThickness, baseThickness * 0.38, t0);
    const thick1 = lerp(baseThickness, baseThickness * 0.38, t1);

    const trunkMargin = Math.min(24, width * 0.2);
    const nx = clamp(
      curX + Math.cos(curAngle) * segLen,
      trunkMargin,
      Math.max(trunkMargin, width - trunkMargin),
    );
    const ny = Math.max(32, curY + Math.sin(curAngle) * segLen);

    const node: BranchNode = {
      id,
      parentId: i === 0 ? null : `t${i - 1}`,
      depth: 0,
      x1: curX,
      y1: curY,
      x2: nx,
      y2: ny,
      thicknessStart: thick0,
      thicknessEnd: thick1,
      angle: curAngle,
      length: Math.sqrt((nx - curX) * (nx - curX) + (ny - curY) * (ny - curY)),
      hasFoliage: stage === "sprout" && i === trunkSegments - 1,
      foliageRadius: stage === "sprout" ? 7 : 0,
      isTrunk: true,
    };

    branches.push(node);
    minX = Math.min(minX, curX, nx);
    maxX = Math.max(maxX, curX, nx);
    minY = Math.min(minY, ny);

    trunkTips.push({
      id,
      x: nx,
      y: ny,
      angle: curAngle,
      thickness: thick1,
    });

    curX = nx;
    curY = ny;
  }

  const spawnBranch = (
    id: string,
    parentId: string,
    x: number,
    y: number,
    angle: number,
    length: number,
    thickness: number,
    depth: number,
  ): boolean => {
    if (depth > maxDepth || length < 5) return false;

    const rng = createRng(hashString(id, seed));
    const endThick = Math.max(1.0, thickness * 0.64);
    const isOuter = depth >= Math.max(1, maxDepth - 1);
    const hasFoliage = isOuter || (species === "pine" && depth >= 1);
    const foliageScale =
      species === "pine" ? 0.8 : species === "sakura" ? 1.0 : 0.95;

    const foliageRadius = clamp(
      (7 + maturity * 12) * Math.pow(0.84, depth - 1) * foliageScale,
      5,
      Math.min(28, maxWidthHalf * 0.52),
    );

    const end = clampBranchEndpoint(
      x,
      y,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
      (hasFoliage ? foliageRadius : 4) + 10,
      width,
      groundY,
    );

    const node: BranchNode = {
      id,
      parentId,
      depth,
      x1: x,
      y1: y,
      x2: end.x2,
      y2: end.y2,
      thicknessStart: thickness,
      thicknessEnd: endThick,
      angle: end.angle,
      length: end.length,
      hasFoliage,
      foliageRadius,
      isTrunk: false,
    };

    branches.push(node);

    let spawnedChildren = 0;
    if (node.length >= 2) {
      const maturityBranchChance = clamp(0.45 + maturity * 0.5, 0.45, 1.0);
      if (depth < maxDepth && rng() < maturityBranchChance) {
        const childCount =
          species === "pine"
            ? 2
            : depth === 1 && maturity > 0.35
              ? 2 + (rng() > 0.55 ? 1 : 0)
              : 2;

        for (let c = 0; c < childCount; c++) {
          const spreadBase =
            species === "pine" ? 0.5 : species === "sakura" ? 0.46 : 0.4;
          const sideSign =
            c === 0 ? -1 : c === 1 ? 1 : rng() > 0.5 ? -0.35 : 0.35;
          const childAngle =
            node.angle +
            sideSign * (spreadBase + rng() * 0.22) +
            inwardLean * 0.2;
          const childLen = node.length * (0.62 + rng() * 0.16);
          if (
            spawnBranch(
              `${id}.${c}`,
              id,
              end.x2,
              end.y2,
              childAngle,
              childLen,
              endThick,
              depth + 1,
            )
          ) {
            spawnedChildren++;
          }
        }
      }
    }

    // Any terminal branch (no spawned child) must bear foliage so no bare tips appear outside winter.
    if (spawnedChildren === 0 && !node.hasFoliage) {
      node.hasFoliage = true;
      const clamped = clampBranchEndpoint(
        node.x1,
        node.y1,
        node.x2,
        node.y2,
        node.foliageRadius + 10,
        width,
        groundY,
      );
      node.x2 = clamped.x2;
      node.y2 = clamped.y2;
      node.angle = clamped.angle;
      node.length = clamped.length;
    }

    const pad = node.hasFoliage ? node.foliageRadius : 4;
    minX = Math.min(minX, node.x2 - pad);
    maxX = Math.max(maxX, node.x2 + pad);
    minY = Math.min(minY, node.y2 - pad);
    return true;
  };

  if (stage !== "sprout") {
    if (species === "pine") {
      for (let s = 1; s < trunkTips.length; s++) {
        const tip = trunkTips[s];
        const tierRatio = 1 - s / (trunkTips.length + 0.5);
        const branchLen = clamp(
          (14 + maturity * 32) * (0.55 + tierRatio * 0.55),
          10,
          maxWidthHalf * 0.85,
        );
        spawnBranch(
          `pL${s}`,
          tip.id,
          tip.x,
          tip.y,
          -Math.PI + 0.36,
          branchLen,
          tip.thickness * 0.68,
          1,
        );
        spawnBranch(
          `pR${s}`,
          tip.id,
          tip.x,
          tip.y,
          -0.36,
          branchLen,
          tip.thickness * 0.68,
          1,
        );
      }
      const crown = trunkTips[trunkTips.length - 1];
      spawnBranch(
        "pTop",
        crown.id,
        crown.x,
        crown.y,
        crown.angle,
        clamp(14 + maturity * 20, 10, 38),
        crown.thickness * 0.72,
        1,
      );
    } else {
      for (let s = 1; s < trunkTips.length - 1; s++) {
        const tip = trunkTips[s];
        const rng = createRng(hashString(`side${s}`, seed));
        if (maturity > 0.18 || s === trunkTips.length - 2) {
          const dir = s % 2 === 0 ? 1 : -1;
          const bLen = clamp(
            targetHeight * (0.2 + rng() * 0.08),
            12,
            maxWidthHalf * 0.85,
          );
          spawnBranch(
            `s${s}`,
            tip.id,
            tip.x,
            tip.y,
            tip.angle + dir * (0.55 + rng() * 0.2),
            bLen,
            tip.thickness * 0.75,
            1,
          );
        }
      }

      const crown = trunkTips[trunkTips.length - 1];
      const crownLen = clamp(targetHeight * 0.25, 12, maxWidthHalf * 0.88);
      spawnBranch(
        "cL",
        crown.id,
        crown.x,
        crown.y,
        crown.angle - 0.42 + inwardLean * 0.25,
        crownLen,
        crown.thickness * 0.82,
        1,
      );
      spawnBranch(
        "cR",
        crown.id,
        crown.x,
        crown.y,
        crown.angle + 0.4 + inwardLean * 0.25,
        crownLen * 0.94,
        crown.thickness * 0.8,
        1,
      );
      if (maturity > 0.25) {
        spawnBranch(
          "cM",
          crown.id,
          crown.x,
          crown.y,
          crown.angle + inwardLean * 0.15,
          crownLen * 1.04,
          crown.thickness * 0.86,
          1,
        );
      }
    }
  }

  return {
    seed,
    growthStep: Math.round(growthHours * 100),
    stage,
    maturity,
    heightFraction,
    branches,
    trunkBaseX,
    groundY,
    boundingBox: {
      minX: Math.max(0, minX - 6),
      minY: Math.max(0, minY - 6),
      maxX: Math.min(width, maxX + 6),
      maxY: Math.min(height, maxY),
    },
  };
}

export interface BranchAnchor {
  branchId: string;
  branchT: number;
  x: number;
  y: number;
  dist: number;
}

/**
 * Finds the closest point along any branch segment of `skeleton` to `(x, y)`.
 */
export function findNearestBranchAnchor(
  skeleton: TreeSkeleton,
  x: number,
  y: number,
): BranchAnchor | null {
  if (skeleton.branches.length === 0) return null;

  let best: BranchAnchor | null = null;
  let bestDistSq = Infinity;

  for (const b of skeleton.branches) {
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 1e-6 ? clamp(((x - b.x1) * dx + (y - b.y1) * dy) / lenSq, 0, 1) : 0.5;
    const px = b.x1 + dx * t;
    const py = b.y1 + dy * t;
    const ddx = x - px;
    const ddy = y - py;
    const distSq = ddx * ddx + ddy * ddy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = {
        branchId: b.id,
        branchT: t,
        x: px,
        y: py,
        dist: Math.sqrt(distSq),
      };
    }
  }

  return best;
}

/**
 * Recalculates decoration normalized positions (`normX`, `normY`) from their anchored
 * branch `(branchId, branchT)` when the tree grows or changes skeleton, or snaps
 * legacy/orphaned decorations onto the closest branch so none float in empty space.
 */
export function repositionDecorationsToBranches(
  decorations: PlacedDecoration[],
  skeleton: TreeSkeleton,
  width: number,
  height: number,
): PlacedDecoration[] {
  if (
    decorations.length === 0 ||
    skeleton.branches.length === 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return decorations;
  }

  const branchById = new Map<string, BranchNode>();
  for (const b of skeleton.branches) {
    branchById.set(b.id, b);
  }

  const out = new Array<PlacedDecoration>(decorations.length);
  for (let i = 0; i < decorations.length; i++) {
    const d = decorations[i];
    const existingBranch = d.branchId ? branchById.get(d.branchId) : undefined;

    if (existingBranch && typeof d.branchT === "number" && Number.isFinite(d.branchT)) {
      const t = clamp(d.branchT, 0, 1);
      const ax = lerp(existingBranch.x1, existingBranch.x2, t);
      const ay = lerp(existingBranch.y1, existingBranch.y2, t);
      out[i] = {
        ...d,
        branchId: existingBranch.id,
        branchT: t,
        normX: clamp(ax / width, 0.03, 0.97),
        normY: clamp(ay / height, 0.03, 0.97),
      };
      continue;
    }

    const anchor = findNearestBranchAnchor(
      skeleton,
      d.normX * width,
      d.normY * height,
    );
    if (!anchor) {
      out[i] = d;
      continue;
    }

    out[i] = {
      ...d,
      branchId: anchor.branchId,
      branchT: anchor.branchT,
      normX: clamp(anchor.x / width, 0.03, 0.97),
      normY: clamp(anchor.y / height, 0.03, 0.97),
    };
  }

  return out;
}
