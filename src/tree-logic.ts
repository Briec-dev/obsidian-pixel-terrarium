export { clamp, createRng, hashString, lerp } from "./shared/math";
export {
  getCityLocalHour,
  isRainyCondition,
  resolveSeason,
  resolveTimeOfDay,
} from "./tree/time-season";
export {
  advancePassiveGrowth,
  applyWatering,
  applyWritingBoost,
  computeMaturity,
  getTreeStage,
} from "./tree/growth";
export {
  findNearestBranchAnchor,
  generateTreeSkeleton,
  repositionDecorationsToBranches,
  type BranchAnchor,
  type SkeletonOptions,
} from "./tree/skeleton";
