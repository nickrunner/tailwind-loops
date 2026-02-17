/**
 * User intent and routing policy.
 *
 * The intent captures what the user wants from their route in natural
 * language and structured preferences. The routing policy is the
 * translated version that the search algorithm can use.
 *
 * Flow: User describes intent -> LLM interprets -> RoutingPolicy -> Search
 */

import type { CorridorType } from "./corridor.js";
import type { SurfaceType } from "./graph.js";

/** The activity type being routed for */
export type ActivityType = "cycling" | "running" | "walking";

/** How tolerant is the user of certain conditions? */
export type Tolerance = "avoid" | "tolerate" | "prefer" | "require";

/** Structured preferences extracted from intent */
export interface Preferences {
  /** Target distance in meters (approximate) */
  targetDistanceMeters?: number;
  /** Minimum acceptable distance */
  minDistanceMeters?: number;
  /** Maximum acceptable distance */
  maxDistanceMeters?: number;
  /** Surface preference */
  surfaceTolerance: Record<SurfaceType, Tolerance>;
  /** Traffic tolerance (busy roads) */
  trafficTolerance: Tolerance;
  /** Stop tolerance (stop signs, lights) */
  stopTolerance: Tolerance;
  /** Hill preference */
  hillPreference: "flat" | "rolling" | "hilly" | "any";
}

/** The user's intent for a route */
export interface ActivityIntent {
  /** What activity is this for? */
  activityType: ActivityType;
  /** Natural language description (optional) */
  naturalLanguage?: string;
  /** Structured preferences */
  preferences: Preferences;
  /** Starting point */
  startCoordinate: { lat: number; lng: number };
  /** Ending point (if point-to-point; omit for loop) */
  endCoordinate?: { lat: number; lng: number };
  /** Is this a loop (return to start)? */
  isLoop: boolean;
}

/** Weights for corridor types in route scoring */
export type CorridorWeights = Record<CorridorType, number>;

/** Hard constraints that must be satisfied */
export interface Constraints {
  /** Surfaces to absolutely avoid */
  avoidSurfaces: SurfaceType[];
  /** Maximum acceptable stop density (stops/km) */
  maxStopDensityPerKm?: number;
  /** Minimum infrastructure continuity (0-1) */
  minInfrastructureContinuity?: number;
}

/**
 * Corridor types relevant for each activity type.
 * Cycling focuses on roads and trails; running/walking focus on paths, trails, and quiet roads.
 * Arterials are included for cycling but will be deprioritized via CorridorWeights during routing.
 */
export const CORRIDOR_TYPES_BY_ACTIVITY: Record<ActivityType, CorridorType[]> =
  {
    cycling: ["trail", "quiet-road", "collector", "arterial", "mixed"],
    running: ["trail", "path", "quiet-road"],
    walking: ["trail", "path", "quiet-road"],
  };

/** The routing policy derived from intent - used by search */
export interface RoutingPolicy {
  /** Weights for different corridor types (higher = prefer) */
  corridorWeights: CorridorWeights;
  /** Hard constraints */
  constraints: Constraints;
  /** Weight for "flow" (long continuous stretches) */
  flowWeight: number;
  /** Weight for minimizing total stops */
  stopWeight: number;
  /** Weight for infrastructure quality */
  infrastructureWeight: number;
  /** Target distance (for loop generation) */
  targetDistanceMeters?: number;
}
