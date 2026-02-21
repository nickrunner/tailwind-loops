/**
 * Route results - the output of the routing engine.
 *
 * A route is composed of segments, which can be either corridors
 * (the primary building blocks) or connecting edges (short segments
 * needed to link corridors together).
 */

import type { Coordinate, GraphEdge, SurfaceType } from "./graph.js";
import type { Corridor, CorridorType } from "./corridor.js";

/** A segment that is a full corridor */
export interface CorridorSegment {
  kind: "corridor";
  corridor: Corridor;
  /** Direction: are we traversing start->end or end->start? */
  reversed: boolean;
  /** Graph edge IDs actually traversed (may be a subset of corridor.edgeIds) */
  traversedEdgeIds: string[];
  /** Ordered coordinates for rendering this segment */
  geometry: Coordinate[];
}

/** A segment that is a connecting edge (not part of a corridor) */
export interface ConnectingSegment {
  kind: "connecting";
  edges: GraphEdge[];
  /** Ordered coordinates for rendering this segment */
  geometry: Coordinate[];
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
  /** Breakdown by surface type (paved/unpaved/unknown) in meters */
  distanceBySurface: Record<SurfaceType, number>;
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

/** Parameters for loop route generation */
export interface LoopSearchParams {
  /** Starting point for the loop */
  startCoordinate: { lat: number; lng: number };
  /** Minimum acceptable distance in meters */
  minDistanceMeters: number;
  /** Maximum acceptable distance in meters */
  maxDistanceMeters: number;
  /** Preferred compass bearing for outward direction (0=N, 90=E, 180=S, 270=W), or omit for any */
  preferredDirection?: number;
  /** How many corridor transitions to prefer */
  turnFrequency?: "minimal" | "moderate" | "frequent";
}
