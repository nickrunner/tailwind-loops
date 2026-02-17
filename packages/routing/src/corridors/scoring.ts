/**
 * Corridor scoring module.
 *
 * Scores corridors along multiple dimensions (flow, safety, surface, character)
 * to produce an overall score per activity type. These scores drive route search
 * by encoding how desirable each corridor is for a given activity.
 */

import type { Corridor, CorridorScore, CorridorType } from "../domain/corridor.js";
import type { RoadClass, SurfaceType } from "../domain/graph.js";
import type { ActivityType } from "../domain/intent.js";

// ---------------------------------------------------------------------------
// Flow scoring
// ---------------------------------------------------------------------------

/**
 * Score the "flow" of a corridor: how continuously you can move without stopping.
 *
 * 60% length component (log curve rewarding longer corridors) +
 * 40% stop component (exponential decay penalizing frequent stops).
 */
export function scoreFlow(corridor: Corridor): number {
  const { lengthMeters, stopDensityPerKm } = corridor.attributes;

  // Length component: log curve scaled so 200m≈0.07, 1km≈0.46, 3km≈0.72, 10km≈0.95
  // f(x) = ln(1 + x/300) / ln(1 + 10000/300)
  const lengthScore = Math.min(
    1,
    Math.log(1 + lengthMeters / 300) / Math.log(1 + 10000 / 300),
  );

  // Stop component: exponential decay e^(-0.2 * density)
  const stopScore = Math.exp(-0.2 * stopDensityPerKm);

  return 0.6 * lengthScore + 0.4 * stopScore;
}

// ---------------------------------------------------------------------------
// Safety scoring
// ---------------------------------------------------------------------------

const SPEED_LIMIT_SCORES: [number, number][] = [
  [30, 1.0],
  [40, 0.8],
  [50, 0.6],
  [60, 0.3],
  [80, 0.1],
];

function scoreSpeedLimit(speedLimit: number | undefined): number {
  if (speedLimit == null) return 0.5;
  for (const [threshold, score] of SPEED_LIMIT_SCORES) {
    if (speedLimit <= threshold) return score;
  }
  return 0.1; // 80+
}

const ROAD_CLASS_SAFETY: Record<string, number> = {
  cycleway: 1.0,
  path: 1.0,
  footway: 1.0,
  residential: 0.8,
  service: 0.8,
  unclassified: 0.8,
  tertiary: 0.6,
  secondary: 0.4,
  track: 0.6,
  primary: 0.2,
  trunk: 0.0,
  motorway: 0.0,
};

function scoreRoadClassSafety(roadClass: RoadClass): number {
  return ROAD_CLASS_SAFETY[roadClass] ?? 0.5;
}

/**
 * Score the safety of a corridor based on infrastructure, separation,
 * speed limits, and road class.
 */
export function scoreSafety(corridor: Corridor): number {
  const {
    infrastructureContinuity,
    separationContinuity,
    averageSpeedLimit,
    predominantRoadClass,
  } = corridor.attributes;

  return (
    0.3 * infrastructureContinuity +
    0.3 * separationContinuity +
    0.2 * scoreSpeedLimit(averageSpeedLimit) +
    0.2 * scoreRoadClassSafety(predominantRoadClass)
  );
}

// ---------------------------------------------------------------------------
// Surface scoring
// ---------------------------------------------------------------------------

const SURFACE_SCORES_CYCLING: Record<SurfaceType, number> = {
  asphalt: 1.0,
  concrete: 0.9,
  paved: 0.9,
  gravel: 0.3,
  dirt: 0.1,
  unpaved: 0.2,
  unknown: 0.4,
};

const SURFACE_SCORES_RUNNING: Record<SurfaceType, number> = {
  asphalt: 0.7,
  concrete: 0.7,
  paved: 0.7,
  gravel: 0.8,
  dirt: 0.9,
  unpaved: 0.6,
  unknown: 0.4,
};

const SURFACE_SCORES_WALKING: Record<SurfaceType, number> = {
  asphalt: 0.7,
  concrete: 0.7,
  paved: 0.8,
  gravel: 0.8,
  dirt: 0.9,
  unpaved: 0.6,
  unknown: 0.5,
};

const SURFACE_SCORES: Record<ActivityType, Record<SurfaceType, number>> = {
  cycling: SURFACE_SCORES_CYCLING,
  running: SURFACE_SCORES_RUNNING,
  walking: SURFACE_SCORES_WALKING,
};

/**
 * Score surface suitability for a given activity.
 * Raw score is scaled by confidence: score * (0.5 + 0.5 * confidence).
 */
export function scoreSurface(
  corridor: Corridor,
  activityType: ActivityType,
): number {
  const { predominantSurface, surfaceConfidence } = corridor.attributes;
  const table = SURFACE_SCORES[activityType];
  const rawScore = table[predominantSurface] ?? 0.4;
  return rawScore * (0.5 + 0.5 * surfaceConfidence);
}

// ---------------------------------------------------------------------------
// Character scoring
// ---------------------------------------------------------------------------

const CHARACTER_SCORES_CYCLING: Record<CorridorType, number> = {
  trail: 1.0,
  "quiet-road": 0.8,
  collector: 0.5,
  path: 0.4,
  arterial: 0.2,
  mixed: 0.3,
};

const CHARACTER_SCORES_RUNNING: Record<CorridorType, number> = {
  trail: 1.0,
  path: 0.9,
  "quiet-road": 0.7,
  collector: 0.3,
  arterial: 0.1,
  mixed: 0.2,
};

const CHARACTER_SCORES_WALKING: Record<CorridorType, number> = {
  path: 1.0,
  trail: 0.9,
  "quiet-road": 0.8,
  collector: 0.3,
  arterial: 0.1,
  mixed: 0.2,
};

const CHARACTER_SCORES: Record<ActivityType, Record<CorridorType, number>> = {
  cycling: CHARACTER_SCORES_CYCLING,
  running: CHARACTER_SCORES_RUNNING,
  walking: CHARACTER_SCORES_WALKING,
};

/**
 * Score the character/type preference for a given activity.
 */
export function scoreCharacter(
  corridor: Corridor,
  activityType: ActivityType,
): number {
  const table = CHARACTER_SCORES[activityType];
  return table[corridor.type] ?? 0.3;
}

// ---------------------------------------------------------------------------
// Overall scoring
// ---------------------------------------------------------------------------

/** Weights for combining the four scoring dimensions */
export interface ScoringWeights {
  flow: number;
  safety: number;
  surface: number;
  character: number;
}

/** Default scoring weights per activity type */
export const DEFAULT_SCORING_WEIGHTS: Record<ActivityType, ScoringWeights> = {
  cycling: { flow: 0.3, safety: 0.25, surface: 0.2, character: 0.25 },
  running: { flow: 0.2, safety: 0.3, surface: 0.25, character: 0.25 },
  walking: { flow: 0.15, safety: 0.35, surface: 0.2, character: 0.3 },
};

/**
 * Score a single corridor for a given activity type.
 * Returns a full CorridorScore breakdown.
 */
export function scoreCorridor(
  corridor: Corridor,
  activityType: ActivityType,
  weights?: ScoringWeights,
): CorridorScore {
  const w = weights ?? DEFAULT_SCORING_WEIGHTS[activityType];

  const flow = scoreFlow(corridor);
  const safety = scoreSafety(corridor);
  const surface = scoreSurface(corridor, activityType);
  const character = scoreCharacter(corridor, activityType);

  const overall =
    w.flow * flow +
    w.safety * safety +
    w.surface * surface +
    w.character * character;

  return { overall, flow, safety, surface, character };
}

/**
 * Score all corridors in a map for a given activity type.
 * Mutates each corridor by setting its `scores` field.
 */
export function scoreCorridors(
  corridors: Map<string, Corridor>,
  activityType: ActivityType,
  weights?: ScoringWeights,
): void {
  for (const corridor of corridors.values()) {
    const score = scoreCorridor(corridor, activityType, weights);
    if (!corridor.scores) {
      corridor.scores = {};
    }
    corridor.scores[activityType] = score;
  }
}
