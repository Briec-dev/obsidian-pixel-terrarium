import { clamp, lerp } from "../shared/math";
import type {
  BranchNode,
  PlacedDecoration,
  Season,
  TimeOfDay,
  TreeSkeleton,
  VisitorFrequency,
} from "../types";
import type { TreeWeatherInput } from "./palette";
import type { Particle } from "./particles";

export type VisitorKind =
  | "bird"
  | "butterfly"
  | "squirrel"
  | "firefly"
  | "woodpecker"
  | "owl"
  | "bee";

export type VisitorLifecycleState = "entering" | "staying" | "leaving";

export interface ActiveVisitor {
  id: number;
  kind: VisitorKind;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  targetX: number;
  targetY: number;
  branchId: string | null;
  phase: number;
  spawnedAt: number;
  expiresAt: number;
  excitedUntil: number;
  nextActionAt: number;
  facing: 1 | -1;
  state?: VisitorLifecycleState;
  leavingSince?: number;
}

export interface VisitorNodePools {
  branchIdSet: ReadonlySet<string>;
  foliageNodes: readonly BranchNode[];
  perchNodes: readonly BranchNode[];
  upperPerchNodes: readonly BranchNode[];
  trunkNodes: readonly BranchNode[];
  climbNodes: readonly BranchNode[];
  birdhouses: readonly PlacedDecoration[];
  lanterns: readonly PlacedDecoration[];
}

export interface VisitorStepCallbacks {
  pushParticle: (p: Particle) => boolean;
  spawnReactionBurst: (x: number, y: number, kind: "heart" | "note" | "sparkle") => void;
  spawnShakeBurst: () => void;
}

function computeEntryPoint(
  kind: VisitorKind,
  destY: number,
  width: number,
  height: number,
  skeleton: TreeSkeleton,
): { x: number; y: number } {
  const outerRight = skeleton.trunkBaseX >= width * 0.5;
  if (kind === "squirrel") {
    return {
      x: outerRight ? width + 14 : -14,
      y: skeleton.groundY - 2,
    };
  }
  return {
    x: outerRight ? width + 16 : -16,
    y: clamp(destY - (10 + Math.random() * 28), 8, Math.max(16, height - 20)),
  };
}

function computeExitPoint(
  kind: VisitorKind,
  curY: number,
  width: number,
  height: number,
  skeleton: TreeSkeleton,
): { x: number; y: number } {
  const outerRight = skeleton.trunkBaseX >= width * 0.5;
  if (kind === "squirrel") {
    return {
      x: outerRight ? width + 18 : -18,
      y: skeleton.groundY - 2,
    };
  }
  return {
    x: outerRight ? width + 22 : -22,
    y: clamp(curY - (16 + Math.random() * 34), -16, Math.max(12, height - 24)),
  };
}

function createVisitor(
  id: number,
  kind: VisitorKind,
  destX: number,
  destY: number,
  branchId: string | null,
  phase: number,
  now: number,
  ttlMs: number,
  nextActionDelayMs: number,
  width: number,
  height: number,
  skeleton: TreeSkeleton,
): ActiveVisitor {
  const entry = computeEntryPoint(kind, destY, width, height, skeleton);
  return {
    id,
    kind,
    x: entry.x,
    y: entry.y,
    baseX: entry.x,
    baseY: entry.y,
    targetX: destX,
    targetY: destY,
    branchId,
    phase,
    spawnedAt: now,
    expiresAt: now + ttlMs,
    excitedUntil: 0,
    nextActionAt: now + nextActionDelayMs,
    facing: destX >= entry.x ? 1 : -1,
    state: "entering",
  };
}

export function hitTestVisitor(
  visitors: readonly ActiveVisitor[],
  x: number,
  y: number,
): ActiveVisitor | null {
  for (let i = visitors.length - 1; i >= 0; i--) {
    const v = visitors[i];
    if (v.state === "leaving") continue;
    if (Math.hypot(x - v.x, y - v.y) <= 18) {
      return v;
    }
  }
  return null;
}

export function interactWithVisitor(
  visitor: ActiveVisitor,
  now: number,
  callbacks: {
    spawnReactionBurst: (x: number, y: number, kind: "heart" | "note" | "sparkle") => void;
    triggerShake: (strength: number) => void;
  },
): void {
  visitor.excitedUntil = now + 2400;
  visitor.nextActionAt = now + 400;
  if (visitor.kind === "bird" || visitor.kind === "owl") {
    callbacks.spawnReactionBurst(visitor.x, visitor.y - 8, "note");
    callbacks.triggerShake(0.35);
  } else if (visitor.kind === "squirrel") {
    callbacks.spawnReactionBurst(visitor.x, visitor.y - 8, "heart");
    callbacks.triggerShake(0.45);
  } else if (visitor.kind === "woodpecker") {
    callbacks.spawnReactionBurst(visitor.x, visitor.y - 8, "note");
    callbacks.triggerShake(0.3);
  } else {
    callbacks.spawnReactionBurst(visitor.x, visitor.y - 6, "sparkle");
  }
}

export function disturbVisitorsList(visitors: readonly ActiveVisitor[], now = Date.now()): void {
  for (const v of visitors) {
    v.excitedUntil = now + 1800;
    v.nextActionAt = now + 150;
  }
}

function runVisitorAiAction(
  v: ActiveVisitor,
  width: number,
  height: number,
  skeleton: TreeSkeleton,
  pools: VisitorNodePools,
  now: number,
  callbacks: VisitorStepCallbacks,
): void {
  if (v.kind === "bird") {
    v.nextActionAt = now + 3500 + Math.random() * 4500;
    if (Math.random() < 0.35) {
      callbacks.spawnReactionBurst(v.x, v.y - 6, "note");
    } else if (pools.perchNodes.length > 0) {
      const nextB = pools.perchNodes[Math.floor(Math.random() * pools.perchNodes.length)];
      const tx = lerp(nextB.x1, nextB.x2, 0.35 + Math.random() * 0.45);
      const ty = lerp(nextB.y1, nextB.y2, 0.35 + Math.random() * 0.45) - 3;
      v.facing = tx >= v.baseX ? 1 : -1;
      v.targetX = tx;
      v.targetY = ty;
    }
    return;
  }

  if (v.kind === "squirrel") {
    v.nextActionAt = now + 2800 + Math.random() * 3500;
    if (pools.climbNodes.length > 0) {
      const nextB = pools.climbNodes[Math.floor(Math.random() * pools.climbNodes.length)];
      const tPos = 0.25 + Math.random() * 0.55;
      const tx = lerp(nextB.x1, nextB.x2, tPos);
      const ty = lerp(nextB.y1, nextB.y2, tPos) - 3;
      v.facing = tx >= v.baseX ? 1 : -1;
      v.targetX = tx;
      v.targetY = ty;
      if (Math.random() < 0.4 && pools.foliageNodes.length > 0) {
        callbacks.spawnShakeBurst();
      }
    }
    return;
  }

  if (v.kind === "woodpecker") {
    v.nextActionAt = now + 2200 + Math.random() * 3000;
    if (Math.random() < 0.65) {
      for (let k = 0; k < 2; k++) {
        if (
          !callbacks.pushParticle({
            kind: "sparkle",
            x: v.x + v.facing * 4,
            y: v.y - 2,
            vx: v.facing * (8 + Math.random() * 14),
            vy: -6 + Math.random() * 18,
            size: 2,
            life: 0,
            maxLife: 0.65,
            color: "#c89b6e",
            phase: 0,
          })
        ) {
          break;
        }
      }
    } else if (pools.trunkNodes.length > 0) {
      const nextT = pools.trunkNodes[Math.floor(Math.random() * pools.trunkNodes.length)];
      v.targetX = lerp(nextT.x1, nextT.x2, 0.5) - v.facing * 4;
      v.targetY = lerp(nextT.y1, nextT.y2, 0.25 + Math.random() * 0.6);
    }
    return;
  }

  if (v.kind === "butterfly" || v.kind === "bee") {
    v.nextActionAt = now + 3200 + Math.random() * 3200;
    if (pools.foliageNodes.length > 0) {
      const nextF = pools.foliageNodes[Math.floor(Math.random() * pools.foliageNodes.length)];
      v.targetX = nextF.x2 + (Math.random() - 0.5) * 14;
      v.targetY = nextF.y2 + (Math.random() - 0.5) * 12;
      v.facing = v.targetX >= v.baseX ? 1 : -1;
      if (v.kind === "bee" && Math.random() < 0.6) {
        callbacks.pushParticle({
          kind: "sparkle",
          x: v.x,
          y: v.y,
          vx: (Math.random() - 0.5) * 10,
          vy: -8,
          size: 2,
          life: 0,
          maxLife: 0.9,
          color: "#ffe46b",
          phase: 0,
        });
      }
    }
    return;
  }

  if (v.kind === "owl") {
    v.nextActionAt = now + 5000 + Math.random() * 4500;
    if (Math.random() < 0.35) {
      callbacks.spawnReactionBurst(v.x, v.y - 8, "note");
    }
    return;
  }

  if (v.kind === "firefly") {
    v.nextActionAt = now + 3800 + Math.random() * 3500;
    if (pools.lanterns.length > 0 && Math.random() < 0.55) {
      const l = pools.lanterns[Math.floor(Math.random() * pools.lanterns.length)];
      v.targetX = l.normX * width + (Math.random() - 0.5) * 26;
      v.targetY = l.normY * height + (Math.random() - 0.5) * 24;
    } else {
      const box = skeleton.boundingBox;
      v.targetX = lerp(box.minX + 10, box.maxX - 10, Math.random());
      v.targetY = lerp(box.minY + 12, box.maxY - 16, Math.random());
    }
  }
}

function applyVisitorMotion(v: ActiveVisitor, excited: boolean): void {
  const traveling = v.state === "entering" || v.state === "leaving";
  if (v.kind === "butterfly" || v.kind === "firefly" || v.kind === "bee") {
    const ampX = v.kind === "bee" ? 7 : 12;
    const ampY = v.kind === "bee" ? 5 : 7;
    v.x = v.baseX + Math.sin(v.phase * 1.1) * ampX;
    v.y = v.baseY + Math.cos(v.phase * 1.6) * ampY;
  } else if (v.kind === "bird") {
    if (traveling) {
      v.x = v.baseX;
      v.y = v.baseY + Math.sin(v.phase * 2.6) * 2.5;
    } else {
      const moving = Math.hypot(v.targetX - v.baseX, v.targetY - v.baseY) > 2;
      const hop = excited || moving ? Math.abs(Math.sin(v.phase * 2.2)) * 5 : 0;
      v.x = v.baseX;
      v.y = v.baseY - hop;
    }
  } else if (v.kind === "squirrel") {
    if (traveling) {
      v.x = v.baseX;
      v.y = v.baseY - Math.abs(Math.sin(v.phase * 3.4)) * 2.5;
    } else {
      const bob = excited ? Math.sin(v.phase * 2.2) * 3 : Math.sin(v.phase) * 0.8;
      v.x = v.baseX;
      v.y = v.baseY + bob;
    }
  } else if (v.kind === "woodpecker") {
    if (traveling) {
      v.x = v.baseX;
      v.y = v.baseY + Math.sin(v.phase * 2.6) * 2.5;
    } else {
      const peck = Math.sin(v.phase * 5) > 0.65 ? v.facing * 1.5 : 0;
      v.x = v.baseX + peck;
      v.y = v.baseY;
    }
  } else if (v.kind === "owl") {
    if (traveling) {
      v.x = v.baseX;
      v.y = v.baseY + Math.sin(v.phase * 2.4) * 2.5;
    } else {
      v.x = v.baseX;
      v.y = v.baseY + (excited ? -Math.abs(Math.sin(v.phase)) * 3 : 0);
    }
  }
}

function maybeSpawnVisitor(
  visitors: ActiveVisitor[],
  width: number,
  height: number,
  skeleton: TreeSkeleton,
  season: Season,
  timeOfDay: TimeOfDay,
  weather: TreeWeatherInput,
  pools: VisitorNodePools,
  allocateId: () => number,
  now: number,
): void {
  if (timeOfDay === "night") {
    if (
      pools.perchNodes.length > 0 &&
      Math.random() < 0.42 &&
      !visitors.some((v) => v.kind === "owl")
    ) {
      const pool = pools.upperPerchNodes.length > 0 ? pools.upperPerchNodes : pools.perchNodes;
      const b = pool[Math.floor(Math.random() * pool.length)];
      const px = lerp(b.x1, b.x2, 0.5);
      const py = lerp(b.y1, b.y2, 0.5) - 3;
      visitors.push(
        createVisitor(
          allocateId(),
          "owl",
          px,
          py,
          b.id,
          0,
          now,
          32_000,
          3500,
          width,
          height,
          skeleton,
        ),
      );
      return;
    }

    if (season === "winter" || (weather.enabled && weather.condition === "snow")) return;
    let fx: number;
    let fy: number;
    if (pools.lanterns.length > 0 && Math.random() < 0.6) {
      const l = pools.lanterns[Math.floor(Math.random() * pools.lanterns.length)];
      fx = l.normX * width + (Math.random() - 0.5) * 20;
      fy = l.normY * height + (Math.random() - 0.5) * 20;
    } else {
      const box = skeleton.boundingBox;
      fx = lerp(box.minX + 10, box.maxX - 10, Math.random());
      fy = lerp(box.minY + 12, box.maxY - 16, Math.random());
    }
    visitors.push(
      createVisitor(
        allocateId(),
        "firefly",
        fx,
        fy,
        null,
        Math.random() * Math.PI * 2,
        now,
        22_000,
        3000,
        width,
        height,
        skeleton,
      ),
    );
    return;
  }

  const roll = Math.random();
  const birdThreshold = pools.birdhouses.length > 0 ? 0.42 : 0.28;
  if (roll < birdThreshold && (pools.perchNodes.length > 0 || pools.birdhouses.length > 0)) {
    let px: number;
    let py: number;
    let branchId: string | null = null;
    if (pools.birdhouses.length > 0 && Math.random() < 0.55) {
      const bh = pools.birdhouses[Math.floor(Math.random() * pools.birdhouses.length)];
      px = bh.normX * width;
      py = bh.normY * height - 7;
    } else {
      const b = pools.perchNodes[Math.floor(Math.random() * pools.perchNodes.length)];
      px = lerp(b.x1, b.x2, 0.55);
      py = lerp(b.y1, b.y2, 0.55) - 3;
      branchId = b.id;
    }
    visitors.push(
      createVisitor(
        allocateId(),
        "bird",
        px,
        py,
        branchId,
        0,
        now,
        26_000,
        2500,
        width,
        height,
        skeleton,
      ),
    );
  } else if (
    roll < 0.58 &&
    (season === "spring" || season === "summer") &&
    !(weather.enabled && weather.condition === "snow")
  ) {
    const b =
      pools.foliageNodes.length > 0
        ? pools.foliageNodes[Math.floor(Math.random() * pools.foliageNodes.length)]
        : pools.perchNodes[0];
    if (b) {
      const kind: VisitorKind = Math.random() < 0.48 ? "bee" : "butterfly";
      visitors.push(
        createVisitor(
          allocateId(),
          kind,
          b.x2,
          b.y2,
          b.id,
          Math.random() * Math.PI * 2,
          now,
          22_000,
          2500,
          width,
          height,
          skeleton,
        ),
      );
    }
  } else if (roll < 0.78 && pools.trunkNodes.length > 1 && skeleton.maturity > 0.18) {
    const t = pools.trunkNodes[Math.min(1, pools.trunkNodes.length - 1)];
    const facing: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
    const px = lerp(t.x1, t.x2, 0.5) - facing * 4;
    const py = lerp(t.y1, t.y2, 0.5);
    visitors.push(
      createVisitor(
        allocateId(),
        "woodpecker",
        px,
        py,
        t.id,
        0,
        now,
        24_000,
        1500,
        width,
        height,
        skeleton,
      ),
    );
  } else if (season !== "winter" && skeleton.maturity > 0.2) {
    const lower =
      pools.perchNodes[0] ?? pools.trunkNodes[Math.min(1, pools.trunkNodes.length - 1)];
    if (lower) {
      const px = lerp(lower.x1, lower.x2, 0.4);
      const py = lerp(lower.y1, lower.y2, 0.4) - 4;
      visitors.push(
        createVisitor(
          allocateId(),
          "squirrel",
          px,
          py,
          lower.id,
          0,
          now,
          26_000,
          2200,
          width,
          height,
          skeleton,
        ),
      );
    }
  }
}

export function stepVisitors(
  visitors: ActiveVisitor[],
  dt: number,
  width: number,
  height: number,
  skeleton: TreeSkeleton,
  season: Season,
  timeOfDay: TimeOfDay,
  weather: TreeWeatherInput,
  visitorFrequency: VisitorFrequency,
  pools: VisitorNodePools,
  lastHeightFraction: number,
  nextSpawnAt: number,
  allocateId: () => number,
  callbacks: VisitorStepCallbacks,
  now: number,
): { lastHeightFraction: number; nextSpawnAt: number } {
  const heavyRainOrStorm =
    weather.enabled &&
    weather.interactionsEnabled &&
    (weather.condition === "rain" ||
      weather.condition === "heavy-rain" ||
      weather.condition === "thunderstorm");

  const shrunk =
    skeleton.branches.length < 2 ||
    (lastHeightFraction > 0 && skeleton.heightFraction < lastHeightFraction * 0.72);
  const nextHeightFraction = skeleton.heightFraction;

  const startLeaving = (v: ActiveVisitor) => {
    const exit = computeExitPoint(v.kind, v.baseY, width, height, skeleton);
    v.state = "leaving";
    v.leavingSince = now;
    v.targetX = exit.x;
    v.targetY = exit.y;
    v.facing = exit.x >= v.baseX ? 1 : -1;
  };

  for (let i = visitors.length - 1; i >= 0; i--) {
    const v = visitors[i];
    const state: VisitorLifecycleState = v.state ?? "staying";
    const outOfBounds =
      state === "staying" &&
      (v.y < skeleton.boundingBox.minY - 16 ||
        v.baseY < skeleton.boundingBox.minY - 16 ||
        v.x < skeleton.boundingBox.minX - 28 ||
        v.x > skeleton.boundingBox.maxX + 28);
    const missingBranch =
      state !== "leaving" &&
      v.branchId !== null &&
      !pools.branchIdSet.has(v.branchId);
    if (shrunk || outOfBounds || missingBranch) {
      if (shrunk || skeleton.stage === "sprout" || pools.perchNodes.length === 0) {
        visitors.splice(i, 1);
        continue;
      }
      const b = pools.perchNodes[i % pools.perchNodes.length];
      const rx = lerp(b.x1, b.x2, 0.5);
      const ry = lerp(b.y1, b.y2, 0.5) - 3;
      v.branchId = b.id;
      v.targetX = rx;
      v.targetY = ry;
      if (state === "staying") {
        v.baseX = rx;
        v.baseY = ry;
        v.x = rx;
        v.y = ry;
      }
    }

    if (
      state !== "leaving" &&
      ((heavyRainOrStorm &&
        (v.kind === "butterfly" || v.kind === "bee" || v.kind === "firefly")) ||
        now >= v.expiresAt)
    ) {
      startLeaving(v);
    }

    const activeState: VisitorLifecycleState = v.state ?? "staying";
    const excited = activeState === "staying" && now < v.excitedUntil;
    v.phase += dt * (excited ? 8 : 2.8);

    if (activeState === "entering" || activeState === "leaving") {
      const travelSpeed =
        v.kind === "bird" || v.kind === "owl" || v.kind === "woodpecker"
          ? 56
          : v.kind === "squirrel"
            ? 50
            : 36;
      const dx = v.targetX - v.baseX;
      const dy = v.targetY - v.baseY;
      const dist = Math.hypot(dx, dy);
      const stepDist = travelSpeed * dt;
      if (dist <= Math.max(3, stepDist)) {
        v.baseX = v.targetX;
        v.baseY = v.targetY;
        if (activeState === "entering") {
          v.state = "staying";
          v.nextActionAt = now + 2200 + Math.random() * 2500;
        }
      } else {
        v.baseX += (dx / dist) * stepDist;
        v.baseY += (dy / dist) * stepDist;
      }

      if (activeState === "leaving") {
        const offScreen =
          v.baseX > width + 10 ||
          v.baseX < -10 ||
          v.baseY < -10 ||
          v.baseY > height + 10;
        const arrivedExit = Math.hypot(v.targetX - v.baseX, v.targetY - v.baseY) <= 3;
        const timedOut = now - (v.leavingSince ?? now) > 8000;
        if (offScreen || arrivedExit || timedOut) {
          visitors.splice(i, 1);
          continue;
        }
      }
    } else {
      const moveSpeed = v.kind === "squirrel" ? 4.2 : v.kind === "bird" ? 3.5 : 2.2;
      v.baseX = lerp(v.baseX, v.targetX, clamp(dt * moveSpeed, 0, 1));
      v.baseY = lerp(v.baseY, v.targetY, clamp(dt * moveSpeed, 0, 1));

      if (now >= v.nextActionAt) {
        runVisitorAiAction(v, width, height, skeleton, pools, now, callbacks);
      }
    }

    applyVisitorMotion(v, excited);
  }

  const maxVisitors =
    visitorFrequency === "calm" ? 1 : visitorFrequency === "normal" ? 2 : 3;
  if (
    now < nextSpawnAt ||
    visitors.length >= maxVisitors ||
    skeleton.branches.length < 2 ||
    heavyRainOrStorm
  ) {
    return { lastHeightFraction: nextHeightFraction, nextSpawnAt };
  }

  const intervalMs =
    visitorFrequency === "calm"
      ? 36_000
      : visitorFrequency === "normal"
        ? 18_000
        : 9_000;
  const updatedSpawnAt = now + intervalMs * (0.7 + Math.random() * 0.6);

  maybeSpawnVisitor(
    visitors,
    width,
    height,
    skeleton,
    season,
    timeOfDay,
    weather,
    pools,
    allocateId,
    now,
  );

  return { lastHeightFraction: nextHeightFraction, nextSpawnAt: updatedSpawnAt };
}

export function renderVisitors(
  pctx: CanvasRenderingContext2D,
  visitors: readonly ActiveVisitor[],
  pixelScale: number,
  isLight: boolean,
): void {
  for (const v of visitors) {
    const vx = Math.round(v.x / pixelScale);
    const vy = Math.round(v.y / pixelScale);
    const flying =
      v.state === "entering" ||
      v.state === "leaving" ||
      Math.hypot(v.targetX - v.baseX, v.targetY - v.baseY) > 2;
    const wingUp = Math.sin(v.phase * 5) > 0;
    if (v.kind === "bird") {
      pctx.fillStyle = "#5f8db8";
      pctx.fillRect(vx - 1, vy - 2, 3, 2);
      pctx.fillStyle = "#d9825b";
      pctx.fillRect(v.facing === 1 ? vx : vx - 1, vy - 1, 2, 1);
      pctx.fillStyle = "#f2b64b";
      pctx.fillRect(vx + v.facing * 2, vy - 2, 1, 1);
      if (flying) {
        pctx.fillStyle = "#8cb8e0";
        pctx.fillRect(vx, wingUp ? vy - 3 : vy, 1, 1);
      }
    } else if (v.kind === "butterfly") {
      pctx.fillStyle = "#f6a444";
      pctx.fillRect(vx - 1, vy - (wingUp ? 2 : 1), 1, 1);
      pctx.fillRect(vx + 1, vy - (wingUp ? 2 : 1), 1, 1);
      pctx.fillStyle = "#3c2b24";
      pctx.fillRect(vx, vy - 1, 1, 2);
    } else if (v.kind === "squirrel") {
      pctx.fillStyle = "#c96f40";
      pctx.fillRect(vx - 1, vy - 2, 3, 2);
      pctx.fillStyle = "#b0552c";
      pctx.fillRect(vx - v.facing * 2, vy - 3, 1, 2);
    } else if (v.kind === "woodpecker") {
      pctx.fillStyle = "#2b303a";
      pctx.fillRect(v.facing === 1 ? vx - 1 : vx, vy - 3, 2, 3);
      pctx.fillStyle = "#e8e8e4";
      pctx.fillRect(vx + v.facing, vy - 2, 1, 2);
      pctx.fillStyle = "#d94e4e";
      pctx.fillRect(vx, vy - 4, 1, 1);
      pctx.fillStyle = "#d4c29a";
      pctx.fillRect(vx + v.facing * 2, vy - 3, 1, 1);
      if (flying) {
        pctx.fillStyle = "#e8e8e4";
        pctx.fillRect(vx - v.facing, wingUp ? vy - 3 : vy - 1, 1, 1);
      }
    } else if (v.kind === "owl") {
      pctx.fillStyle = "#7a5b47";
      pctx.fillRect(vx - 1, vy - 3, 3, 3);
      pctx.fillStyle = "#a3826b";
      pctx.fillRect(vx, vy - 2, 1, 2);
      if (flying) {
        pctx.fillStyle = "#7a5b47";
        const wy = wingUp ? vy - 3 : vy - 2;
        pctx.fillRect(vx - 2, wy, 1, 1);
        pctx.fillRect(vx + 2, wy, 1, 1);
      }
      const blink = Math.sin(v.phase * 0.7) > 0.92;
      if (!blink) {
        pctx.fillStyle = "#ffd966";
        pctx.fillRect(vx - 1, vy - 3, 1, 1);
        pctx.fillRect(vx + 1, vy - 3, 1, 1);
      }
    } else if (v.kind === "bee") {
      pctx.fillStyle = "#ffd23f";
      pctx.fillRect(v.facing === 1 ? vx : vx - 1, vy - 1, 2, 1);
      pctx.fillStyle = "#2b2520";
      pctx.fillRect(vx + (v.facing === 1 ? 1 : -1), vy - 1, 1, 1);
      pctx.fillStyle = isLight
        ? "rgba(85, 115, 160, 0.85)"
        : "rgba(235, 248, 255, 0.85)";
      pctx.fillRect(vx, vy - 2, 1, 1);
    } else if (v.kind === "firefly") {
      pctx.fillStyle = isLight ? "#77a612" : "#d9ff78";
      pctx.fillRect(vx, vy, 1, 1);
    }
  }
}
