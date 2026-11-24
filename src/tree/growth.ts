import { clamp } from "../shared/math";
import type { TreeStage, TreeState, WeatherCondition } from "../types";

export function getTreeStage(growthHours: number): TreeStage {
  if (growthHours < 1.5) return "sprout";
  if (growthHours < 8) return "seedling";
  if (growthHours < 25) return "sapling";
  if (growthHours < 65) return "young";
  if (growthHours < 140) return "mature";
  return "ancient";
}

/**
 * Computes continuous maturity metric:
 * - 0..1 from sprout to mature (~100h)
 * - continues climbing logarithmically past 1.0 forever without resetting.
 */
export function computeMaturity(growthHours: number): number {
  const h = Math.max(0.3, growthHours);
  if (h <= 100) {
    return clamp(Math.pow(h / 100, 0.72), 0.04, 1);
  }
  return 1 + Math.log10(1 + (h - 100) / 120) * 0.45;
}

/**
 * Advances growth & hydration gently for elapsed time using the current weather condition.
 * Never kills or withers the tree when dry; watered state simply grants a mild boost.
 */
export function advancePassiveGrowth(
  state: TreeState,
  elapsedSeconds: number,
  speedMultiplier: number,
  now = Date.now(),
  weatherCondition: WeatherCondition | null = null,
): TreeState {
  if (elapsedSeconds <= 0) {
    return { ...state, lastTickAt: now };
  }

  const clampedElapsed = Math.min(elapsedSeconds, 600);
  const waterMultiplier = now < state.waterBoostUntil ? 1.35 : 1.0;
  const moistureFactor = state.moisture > 20 ? 1.0 : 0.72;

  const addedHours =
    (clampedElapsed / 3600) *
    Math.max(0.2, speedMultiplier) *
    waterMultiplier *
    moistureFactor;

  let moistureDelta: number;
  if (weatherCondition === "drizzle") {
    moistureDelta = clampedElapsed * 0.25;
  } else if (weatherCondition === "rain") {
    moistureDelta = clampedElapsed * 0.6;
  } else if (weatherCondition === "heavy-rain" || weatherCondition === "thunderstorm") {
    moistureDelta = clampedElapsed * 1.0;
  } else {
    const sunEvapFactor = weatherCondition === "clear-day" ? 1.2 : 1.0;
    moistureDelta = -(clampedElapsed / 3600) * 4.5 * Math.min(speedMultiplier, 5) * sunEvapFactor;
  }

  return {
    ...state,
    growthHours: state.growthHours + addedHours,
    activeSeconds: state.activeSeconds + Math.round(clampedElapsed),
    moisture: clamp(state.moisture + moistureDelta, 10, 100),
    lastTickAt: now,
  };
}

export function applyWritingBoost(
  state: TreeState,
  speedMultiplier: number,
  now = Date.now(),
): TreeState {
  const waterBonus = now < state.waterBoostUntil ? 1.3 : 1.0;
  const boostHours = 0.008 * Math.max(0.2, speedMultiplier) * waterBonus;
  return {
    ...state,
    growthHours: state.growthHours + boostHours,
    editBoostCount: state.editBoostCount + 1,
  };
}

export function applyWatering(
  state: TreeState,
  speedMultiplier: number,
  now = Date.now(),
): TreeState {
  return {
    ...state,
    moisture: 100,
    waterBoostUntil: now + 20 * 60 * 1000,
    growthHours: state.growthHours + 0.04 * Math.max(0.5, Math.min(speedMultiplier, 10)),
    timesWatered: state.timesWatered + 1,
  };
}
