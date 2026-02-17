/**
 * Edge compatibility scoring for corridor clustering.
 *
 * Scores whether two adjacent graph edges should belong to the same corridor.
 * Higher scores mean the edges have more similar character and should be merged.
 */

import type { EdgeAttributes, RoadClass, SurfaceType } from "../domain/graph.js";
import type { CorridorBuilderOptions } from "./index.js";
import { DEFAULT_CORRIDOR_OPTIONS } from "./index.js";

/**
 * Groups of road classes that are considered compatible.
 * Roads within the same group get partial compatibility credit;
 * roads in different groups are incompatible.
 */
const ROAD_CLASS_GROUPS: Record<RoadClass, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  residential: 5,
  service: 5,
  unclassified: 5,
  cycleway: 6,
  path: 7,
  footway: 7,
  track: 8,
};

/**
 * Ordinal rank for road classes within traffic-carrying roads.
 * Used to measure how "far apart" two road classes are.
 */
const ROAD_CLASS_RANK: Record<RoadClass, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  residential: 5,
  service: 6,
  unclassified: 6,
  cycleway: 7,
  path: 8,
  footway: 8,
  track: 9,
};

/** Surface groups for compatibility: paved surfaces vs unpaved */
const SURFACE_GROUPS: Record<SurfaceType, number> = {
  asphalt: 0,
  concrete: 0,
  paved: 0,
  gravel: 1,
  dirt: 2,
  unpaved: 1,
  unknown: -1,
};

// Scoring weights — must sum to 1.0
const WEIGHT_ROAD_CLASS = 0.45;
const WEIGHT_SURFACE = 0.25;
const WEIGHT_INFRASTRUCTURE = 0.20;
const WEIGHT_NAME = 0.10;

/**
 * Score compatibility between two adjacent edges for corridor clustering.
 *
 * @param a - First edge attributes
 * @param b - Second edge attributes
 * @param options - Corridor builder options for thresholds
 * @returns 0-1 compatibility score (1 = identical character, 0 = completely different)
 */
export function edgeCompatibility(
  a: EdgeAttributes,
  b: EdgeAttributes,
  options?: CorridorBuilderOptions
): number {
  const opts = { ...DEFAULT_CORRIDOR_OPTIONS, ...options };

  // Hard constraint: speed limit difference beyond threshold → 0
  if (a.speedLimit != null && b.speedLimit != null) {
    if (Math.abs(a.speedLimit - b.speedLimit) > opts.maxSpeedDifference) {
      return 0;
    }
  }

  const roadClassScore = scoreRoadClass(a.roadClass, b.roadClass);

  // Hard constraint: completely different road class groups → 0
  if (roadClassScore === 0) {
    return 0;
  }

  const surfaceScore = scoreSurface(
    a.surfaceClassification.surface,
    b.surfaceClassification.surface
  );
  const infraScore = scoreInfrastructure(a.infrastructure, b.infrastructure);
  const nameScore = scoreName(a.name, b.name, opts.allowNameChanges);

  return (
    WEIGHT_ROAD_CLASS * roadClassScore +
    WEIGHT_SURFACE * surfaceScore +
    WEIGHT_INFRASTRUCTURE * infraScore +
    WEIGHT_NAME * nameScore
  );
}

/** Score road class compatibility (0-1) */
function scoreRoadClass(a: RoadClass, b: RoadClass): number {
  if (a === b) return 1;

  // Different groups → incompatible
  if (ROAD_CLASS_GROUPS[a] !== ROAD_CLASS_GROUPS[b]) {
    return 0;
  }

  // Same group but different class (e.g. residential vs service)
  const rankDiff = Math.abs(ROAD_CLASS_RANK[a] - ROAD_CLASS_RANK[b]);
  return Math.max(0, 1 - rankDiff * 0.3);
}

/** Score surface type compatibility (0-1) */
function scoreSurface(a: SurfaceType, b: SurfaceType): number {
  if (a === b) return 1;

  // Unknown surface → partial credit
  if (a === "unknown" || b === "unknown") return 0.5;

  const groupA = SURFACE_GROUPS[a];
  const groupB = SURFACE_GROUPS[b];

  if (groupA === groupB) return 0.8;

  // Different surface groups (e.g. paved vs gravel)
  const diff = Math.abs(groupA - groupB);
  return Math.max(0, 1 - diff * 0.5);
}

/** Score infrastructure compatibility (0-1) */
function scoreInfrastructure(
  a: EdgeAttributes["infrastructure"],
  b: EdgeAttributes["infrastructure"]
): number {
  let matches = 0;
  let total = 3;

  if (a.hasDedicatedPath === b.hasDedicatedPath) matches++;
  if (a.hasShoulder === b.hasShoulder) matches++;
  if (a.isSeparated === b.isSeparated) matches++;

  return matches / total;
}

/** Score name compatibility (0-1) */
function scoreName(
  a: string | undefined,
  b: string | undefined,
  allowNameChanges: boolean
): number {
  // Both unnamed → match
  if (!a && !b) return 1;

  // Same name → match
  if (a && b && a === b) return 1;

  // Name change: score depends on option
  if (allowNameChanges) return 0.5;
  return 0;
}
