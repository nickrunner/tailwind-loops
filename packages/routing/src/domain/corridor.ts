/**
 * Corridor abstraction - the key concept in this routing engine.
 *
 * A corridor represents a continuous stretch of road/path with relatively
 * uniform character. Instead of routing on individual street segments,
 * we route on corridors to achieve "flow" - long continuous stretches
 * with minimal stops and consistent riding character.
 *
 * Corridors are derived from the raw graph by aggregating contiguous
 * edges with similar attributes.
 */

import type { Coordinate, RoadClass, SurfaceType } from "./graph.js";

/** Classification of a corridor based on its character */
export type CorridorType =
  | "trail" // Dedicated multi-use path (rail-trail, greenway)
  | "path" // Smaller path (park path, connector)
  | "quiet-road" // Low-traffic residential or rural road
  | "collector" // Medium-traffic road with acceptable conditions
  | "arterial" // Higher-traffic but may have infrastructure
  | "mixed"; // Corridor with varying character (less desirable)

/** Aggregated statistics about a corridor */
export interface CorridorAttributes {
  /** Total length in meters */
  lengthMeters: number;
  /** Predominant road class */
  predominantRoadClass: RoadClass;
  /** Predominant surface type */
  predominantSurface: SurfaceType;
  /** Confidence that surface is as reported (0-1) */
  surfaceConfidence: number;
  /** Average speed limit across the corridor (km/h) */
  averageSpeedLimit?: number;
  /** Stop density: stops per km (stop signs, traffic lights) */
  stopDensityPerKm: number;
  /** Fraction of corridor with dedicated infrastructure (0-1) */
  infrastructureContinuity: number;
  /** Fraction of corridor separated from motor traffic (0-1) */
  separationContinuity: number;
  /** Number of sharp turns or direction changes */
  turnsCount: number;
}

/** A corridor - continuous stretch with uniform riding character */
export interface Corridor {
  id: string;
  /** Human-readable name (derived from road names or generated) */
  name?: string;
  /** Classification */
  type: CorridorType;
  /** Aggregated attributes */
  attributes: CorridorAttributes;
  /** Ordered list of edge IDs that compose this corridor */
  edgeIds: string[];
  /** Start node ID */
  startNodeId: string;
  /** End node ID */
  endNodeId: string;
  /** Simplified geometry for display (not all edge points) */
  geometry: Coordinate[];
}

/** A collection of corridors for a region */
export interface CorridorNetwork {
  corridors: Map<string, Corridor>;
  /** Adjacency: corridorId -> connected corridorIds */
  connections: Map<string, string[]>;
}
