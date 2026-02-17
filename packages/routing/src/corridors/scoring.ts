/**
 * Corridor scoring module.
 *
 * Scores corridors along multiple dimensions (flow, safety, surface, character)
 * to produce an overall score per activity type. These scores drive route search
 * by encoding how desirable each corridor is for a given activity.
 *
 * Activity types:
 * - road-cycling: serious road cyclists. Prefer open, quiet, scenic roads.
 *   Avoid gravel/unpaved. Trails/cycleways are NOT preferred (ped traffic, stops).
 * - gravel-cycling: gravel/adventure riders. Strongly prefer unpaved surfaces.
 *   Trails and quiet roads are great.
 * - running: prefer trails, paths, and quiet roads with softer surfaces.
 * - walking: very permissive, prefer paths and trails.
 */

import type { Corridor, CorridorScore, CorridorType, RoadClass, SurfaceType, ActivityType } from "@tailwind-loops/types";

// ---------------------------------------------------------------------------
// Parameterized scoring types
// ---------------------------------------------------------------------------

/** Tunable parameters for the flow scoring dimension */
export interface FlowParams {
  lengthLogDenominator: number;
  lengthLogNumerator: number;
  stopDecayRate: number;
  lengthBlend: number;
}

/** Tunable sub-weights for the safety scoring dimension */
export interface SafetyParams {
  infrastructure: number;
  separation: number;
  speedLimit: number;
  roadClass: number;
}

/** All tunable scoring parameters bundled together */
export interface ScoringParams {
  weights: ScoringWeights;
  flow: FlowParams;
  safety: SafetyParams;
  surfaceScores: Record<SurfaceType, number>;
  characterScores: Record<CorridorType, number>;
  surfaceConfidenceMinFactor: number;
}

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
  return scoreFlowWithParams(corridor, {
    lengthLogDenominator: 300,
    lengthLogNumerator: 10000,
    stopDecayRate: 0.2,
    lengthBlend: 0.6,
  });
}

/** Parameterized flow scoring. */
export function scoreFlowWithParams(corridor: Corridor, params: FlowParams): number {
  const { lengthMeters, stopDensityPerKm } = corridor.attributes;

  const lengthScore = Math.min(
    1,
    Math.log(1 + lengthMeters / params.lengthLogDenominator) /
      Math.log(1 + params.lengthLogNumerator / params.lengthLogDenominator),
  );
  const stopScore = Math.exp(-params.stopDecayRate * stopDensityPerKm);

  return params.lengthBlend * lengthScore + (1 - params.lengthBlend) * stopScore;
}

// ---------------------------------------------------------------------------
// Safety scoring
// ---------------------------------------------------------------------------

const SPEED_LIMIT_SCORES: [number, number][] = [
  [30, 1.0],
  [40, 0.8],
  [50, 0.6],
  [60, 0.3],
  [80, 0.1]
];

function scoreSpeedLimit(speedLimit: number | undefined): number {
  if (speedLimit == null) return 0.5;
  for (const [threshold, score] of SPEED_LIMIT_SCORES) {
    if (speedLimit <= threshold) return score;
  }
  return 0.1;
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
  motorway: 0.0
};

function scoreRoadClassSafety(roadClass: RoadClass): number {
  return ROAD_CLASS_SAFETY[roadClass] ?? 0.5;
}

/**
 * Score the safety of a corridor based on infrastructure, separation,
 * speed limits, and road class.
 */
export function scoreSafety(corridor: Corridor): number {
  return scoreSafetyWithParams(corridor, {
    infrastructure: 0.3,
    separation: 0.3,
    speedLimit: 0.2,
    roadClass: 0.2,
  });
}

/** Parameterized safety scoring. */
export function scoreSafetyWithParams(corridor: Corridor, params: SafetyParams): number {
  const {
    infrastructureContinuity,
    separationContinuity,
    averageSpeedLimit,
    predominantRoadClass,
  } = corridor.attributes;

  return (
    params.infrastructure * infrastructureContinuity +
    params.separation * separationContinuity +
    params.speedLimit * scoreSpeedLimit(averageSpeedLimit) +
    params.roadClass * scoreRoadClassSafety(predominantRoadClass)
  );
}

// ---------------------------------------------------------------------------
// Surface scoring
// ---------------------------------------------------------------------------

/**
 * Road cycling: MUST be paved. Gravel/dirt/unpaved are disqualifying (score 0).
 */
const SURFACE_SCORES_ROAD_CYCLING: Record<SurfaceType, number> = {
  asphalt: 1.0,
  concrete: 0.9,
  paved: 0.9,
  gravel: 0.0,
  dirt: 0.0,
  unpaved: 0.0,
  unknown: 0.3
};

/**
 * Gravel cycling: strongly prefers gravel and unpaved. Paved is OK but not ideal.
 */
const SURFACE_SCORES_GRAVEL_CYCLING: Record<SurfaceType, number> = {
  gravel: 1.0,
  dirt: 0.9,
  unpaved: 0.8,
  asphalt: 0.4,
  concrete: 0.3,
  paved: 0.4,
  unknown: 0.4
};

const SURFACE_SCORES_RUNNING: Record<SurfaceType, number> = {
  dirt: 0.9,
  gravel: 0.8,
  asphalt: 0.7,
  paved: 0.7,
  concrete: 0.6,
  unpaved: 0.6,
  unknown: 0.4
};

const SURFACE_SCORES_WALKING: Record<SurfaceType, number> = {
  paved: 0.8,
  asphalt: 0.7,
  concrete: 0.7,
  gravel: 0.8,
  dirt: 0.8,
  unpaved: 0.6,
  unknown: 0.5
};

const SURFACE_SCORES: Record<ActivityType, Record<SurfaceType, number>> = {
  "road-cycling": SURFACE_SCORES_ROAD_CYCLING,
  "gravel-cycling": SURFACE_SCORES_GRAVEL_CYCLING,
  running: SURFACE_SCORES_RUNNING,
  walking: SURFACE_SCORES_WALKING
};

/**
 * Score surface suitability for a given activity.
 * Raw score is scaled by confidence: score * (0.5 + 0.5 * confidence).
 */
export function scoreSurface(corridor: Corridor, activityType: ActivityType): number {
  return scoreSurfaceWithParams(
    corridor,
    SURFACE_SCORES[activityType],
    0.5,
  );
}

/** Parameterized surface scoring. */
export function scoreSurfaceWithParams(
  corridor: Corridor,
  surfaceScores: Record<SurfaceType, number>,
  surfaceConfidenceMinFactor: number,
): number {
  const { predominantSurface, surfaceConfidence } = corridor.attributes;
  const rawScore = surfaceScores[predominantSurface] ?? 0.4;
  return rawScore * (surfaceConfidenceMinFactor + (1 - surfaceConfidenceMinFactor) * surfaceConfidence);
}

// ---------------------------------------------------------------------------
// Character scoring
// ---------------------------------------------------------------------------

/**
 * Road cycling: quiet, open, scenic roads are king. Trails/cycleways are
 * actually undesirable (ped traffic, frequent stops, speed limits).
 * Collectors and quiet roads with good pavement are ideal.
 */
const CHARACTER_SCORES_ROAD_CYCLING: Record<CorridorType, number> = {
  "quiet-road": 1.0,
  collector: 0.7,
  mixed: 0.5,
  arterial: 0.3,
  trail: 0.3,
  path: 0.1
};

/**
 * Gravel cycling: trails and quiet roads are great. Prefers off-road character.
 */
const CHARACTER_SCORES_GRAVEL_CYCLING: Record<CorridorType, number> = {
  trail: 1.0,
  "quiet-road": 0.8,
  mixed: 0.7,
  collector: 0.4,
  path: 0.1,
  arterial: 0.1
};

const CHARACTER_SCORES_RUNNING: Record<CorridorType, number> = {
  trail: 1.0,
  path: 0.9,
  "quiet-road": 0.7,
  collector: 0.3,
  arterial: 0.1,
  mixed: 0.2
};

const CHARACTER_SCORES_WALKING: Record<CorridorType, number> = {
  path: 1.0,
  trail: 0.9,
  "quiet-road": 0.8,
  collector: 0.3,
  arterial: 0.1,
  mixed: 0.2
};

const CHARACTER_SCORES: Record<ActivityType, Record<CorridorType, number>> = {
  "road-cycling": CHARACTER_SCORES_ROAD_CYCLING,
  "gravel-cycling": CHARACTER_SCORES_GRAVEL_CYCLING,
  running: CHARACTER_SCORES_RUNNING,
  walking: CHARACTER_SCORES_WALKING
};

/**
 * Score the character/type preference for a given activity.
 */
export function scoreCharacter(corridor: Corridor, activityType: ActivityType): number {
  return scoreCharacterWithParams(corridor, CHARACTER_SCORES[activityType]);
}

/** Parameterized character scoring. */
export function scoreCharacterWithParams(
  corridor: Corridor,
  characterScores: Record<CorridorType, number>,
): number {
  return characterScores[corridor.type] ?? 0.3;
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
  "road-cycling": { flow: 0.3, safety: 0.2, surface: 0.25, character: 0.25 },
  "gravel-cycling": { flow: 0.25, safety: 0.2, surface: 0.3, character: 0.25 },
  running: { flow: 0.2, safety: 0.3, surface: 0.25, character: 0.25 },
  walking: { flow: 0.15, safety: 0.35, surface: 0.2, character: 0.3 }
};

/**
 * Score a single corridor for a given activity type.
 * Returns a full CorridorScore breakdown.
 */
export function scoreCorridor(
  corridor: Corridor,
  activityType: ActivityType,
  weights?: ScoringWeights
): CorridorScore {
  const w = weights ?? DEFAULT_SCORING_WEIGHTS[activityType];

  const flow = scoreFlow(corridor);
  const safety = scoreSafety(corridor);
  const surface = scoreSurface(corridor, activityType);
  const character = scoreCharacter(corridor, activityType);

  const overall = w.flow * flow + w.safety * safety + w.surface * surface + w.character * character;

  return { overall: Math.max(0, Math.min(1, overall)), flow, safety, surface, character };
}

/** Score a single corridor using fully parameterized scoring. */
export function scoreCorridorWithParams(
  corridor: Corridor,
  params: ScoringParams,
): CorridorScore {
  const flow = scoreFlowWithParams(corridor, params.flow);
  const safety = scoreSafetyWithParams(corridor, params.safety);
  const surface = scoreSurfaceWithParams(corridor, params.surfaceScores, params.surfaceConfidenceMinFactor);
  const character = scoreCharacterWithParams(corridor, params.characterScores);

  const w = params.weights;
  const overall = w.flow * flow + w.safety * safety + w.surface * surface + w.character * character;

  return { overall: Math.max(0, Math.min(1, overall)), flow, safety, surface, character };
}

/**
 * Score all corridors in a map for a given activity type.
 * Mutates each corridor by setting its `scores` field.
 */
export function scoreCorridors(
  corridors: Map<string, Corridor>,
  activityType: ActivityType,
  weights?: ScoringWeights
): void {
  for (const corridor of corridors.values()) {
    const score = scoreCorridor(corridor, activityType, weights);
    if (!corridor.scores) {
      corridor.scores = {};
    }
    corridor.scores[activityType] = score;
  }
}

/** Score all corridors using fully parameterized scoring. Mutates each corridor's scores. */
export function scoreCorridorsWithParams(
  corridors: Map<string, Corridor>,
  activityType: ActivityType,
  params: ScoringParams,
): void {
  for (const corridor of corridors.values()) {
    const score = scoreCorridorWithParams(corridor, params);
    if (!corridor.scores) {
      corridor.scores = {};
    }
    corridor.scores[activityType] = score;
  }
}

// @tuner-defaults-start
const DEFAULT_SCORING_PARAMS: Record<ActivityType, ScoringParams> = {
  "road-cycling": {
    weights: { flow: 0.3, safety: 0.2, surface: 0.25, character: 0.25 },
    flow: { lengthLogDenominator: 300, lengthLogNumerator: 10000, stopDecayRate: 0.2, lengthBlend: 0.6 },
    safety: { infrastructure: 0.3, separation: 0.3, speedLimit: 0.2, roadClass: 0.2 },
    surfaceScores: { asphalt: 1, concrete: 0.9, paved: 0.9, gravel: 0, dirt: 0, unpaved: 0, unknown: 0.3 },
    characterScores: { "quiet-road": 1, collector: 0.7, mixed: 0.5, arterial: 0.3, trail: 0.3, path: 0.1 },
    surfaceConfidenceMinFactor: 0.5,
  },
  "gravel-cycling": {
    weights: { flow: 0.25, safety: 0.2, surface: 0.3, character: 0.25 },
    flow: { lengthLogDenominator: 300, lengthLogNumerator: 10000, stopDecayRate: 0.2, lengthBlend: 0.6 },
    safety: { infrastructure: 0.3, separation: 0.3, speedLimit: 0.2, roadClass: 0.2 },
    surfaceScores: { gravel: 1, dirt: 0.9, unpaved: 0.8, asphalt: 0.4, concrete: 0.3, paved: 0.4, unknown: 0.4 },
    characterScores: { trail: 0.17, "quiet-road": 0.8, mixed: 0.7, collector: 0.4, path: 0, arterial: 0.1 },
    surfaceConfidenceMinFactor: 0.5,
  },
  running: {
    weights: { flow: 0.2, safety: 0.3, surface: 0.25, character: 0.25 },
    flow: { lengthLogDenominator: 300, lengthLogNumerator: 10000, stopDecayRate: 0.2, lengthBlend: 0.6 },
    safety: { infrastructure: 0.3, separation: 0.3, speedLimit: 0.2, roadClass: 0.2 },
    surfaceScores: { dirt: 0.9, gravel: 0.8, asphalt: 0.7, paved: 0.7, concrete: 0.6, unpaved: 0.6, unknown: 0.4 },
    characterScores: { trail: 1, path: 0.9, "quiet-road": 0.7, collector: 0.3, arterial: 0.1, mixed: 0.2 },
    surfaceConfidenceMinFactor: 0.5,
  },
  walking: {
    weights: { flow: 0.15, safety: 0.35, surface: 0.2, character: 0.3 },
    flow: { lengthLogDenominator: 300, lengthLogNumerator: 10000, stopDecayRate: 0.2, lengthBlend: 0.6 },
    safety: { infrastructure: 0.3, separation: 0.3, speedLimit: 0.2, roadClass: 0.2 },
    surfaceScores: { paved: 0.8, asphalt: 0.7, concrete: 0.7, gravel: 0.8, dirt: 0.8, unpaved: 0.6, unknown: 0.5 },
    characterScores: { path: 1, trail: 0.9, "quiet-road": 0.8, collector: 0.3, arterial: 0.1, mixed: 0.2 },
    surfaceConfidenceMinFactor: 0.5,
  },
};
// @tuner-defaults-end

/** Get the default ScoringParams for a given activity type. */
export function getDefaultScoringParams(activityType: ActivityType): ScoringParams {
  const p = DEFAULT_SCORING_PARAMS[activityType];
  return {
    weights: { ...p.weights },
    flow: { ...p.flow },
    safety: { ...p.safety },
    surfaceScores: { ...p.surfaceScores },
    characterScores: { ...p.characterScores },
    surfaceConfidenceMinFactor: p.surfaceConfidenceMinFactor,
  };
}
