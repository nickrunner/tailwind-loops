/**
 * Route results - the output of the routing engine.
 *
 * A route is composed of segments, which can be either corridors
 * (the primary building blocks) or connecting edges (short segments
 * needed to link corridors together).
 */

import type { Coordinate, GraphEdge } from "./graph.js";
import type { Corridor, CorridorType } from "./corridor.js";

/** A segment that is a full corridor */
export interface CorridorSegment {
  kind: "corridor";
  corridor: Corridor;
  /** Direction: are we traversing start->end or end->start? */
  reversed: boolean;
}

/** A segment that is a connecting edge (not part of a corridor) */
export interface ConnectingSegment {
  kind: "connecting";
  edges: GraphEdge[];
}

/** A segment of the route */
export type RouteSegment = CorridorSegment | ConnectingSegment;

/** Aggregated statistics about a route */
export interface RouteStats {
  /** Total distance in meters */
  totalDistanceMeters: number;
  /** Estimated duration in seconds (activity-dependent) */
  estimatedDurationSeconds?: number;
  /** Total number of stops (stop signs, lights) */
  totalStops: number;
  /** Breakdown by corridor type */
  distanceByCorridorType: Record<CorridorType, number>;
  /** Average infrastructure continuity (0-1) */
  averageInfrastructureContinuity: number;
  /** "Flow score" - how continuous/uninterrupted is the route? (0-1) */
  flowScore: number;
  /** Elevation gain in meters (if available) */
  elevationGainMeters?: number;
  /** Elevation loss in meters (if available) */
  elevationLossMeters?: number;
  /** Maximum grade percent across all segments (if available) */
  maxGradePercent?: number;
}

/** A complete route */
export interface Route {
  id: string;
  /** Ordered segments from start to end */
  segments: RouteSegment[];
  /** Computed statistics */
  stats: RouteStats;
  /** Full geometry for rendering */
  geometry: Coordinate[];
  /** Overall route score (higher = better match to intent) */
  score: number;
}

/** Multiple route alternatives */
export interface RouteAlternatives {
  /** The primary/recommended route */
  primary: Route;
  /** Alternative routes (if requested) */
  alternatives: Route[];
}
