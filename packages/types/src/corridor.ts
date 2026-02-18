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
import type { CorridorConfidence } from "./enrichment.js";
import type { ActivityType } from "./intent.js";

/** Score breakdown for a corridor (all values 0-1, higher is better) */
export interface CorridorScore {
  overall: number;
  flow: number;
  safety: number;
  surface: number;
  character: number;
  scenic: number;
}

/** Classification of a corridor based on its character */
export type CorridorType =
  | "trail" // Dedicated multi-use path (rail-trail, greenway)
  | "path" // Smaller path (park path, connector)
  | "neighborhood" // Urban/suburban residential (frequent stops, traffic calming)
  | "rural-road" // Low-density rural/country road (few stops, no sidewalks)
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
  /** Stop density: stops per km (stop signs, traffic lights, road crossings) */
  stopDensityPerKm: number;
  /** Crossing density: graph intersections per km (from topology, not tags) */
  crossingDensityPerKm: number;
  /** Fraction of corridor with bicycle infrastructure — bike lanes, cycle tracks, cycleways (0-1) */
  bicycleInfraContinuity: number;
  /** Fraction of corridor that is pedestrian path — footways, sidewalks, generic paths (0-1) */
  pedestrianPathContinuity: number;
  /** Fraction of corridor separated from motor traffic (0-1) */
  separationContinuity: number;
  /** Number of sharp turns or direction changes */
  turnsCount: number;
  /** Fraction of corridor with traffic calming measures (0-1) */
  trafficCalmingContinuity: number;
  /** Fraction of corridor length with scenic designation (0-1) */
  scenicScore: number;
  /** Per-dimension confidence from multi-source enrichment */
  confidence?: CorridorConfidence;
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
  /** Whether this corridor is one-way (directional) or bidirectional */
  oneWay: boolean;
  /** Per-activity scoring breakdown (populated by scoring module) */
  scores?: Partial<Record<ActivityType, CorridorScore>>;
}

/**
 * Connector - a short segment that links corridors together.
 *
 * While corridors represent long, continuous stretches with uniform character,
 * connectors are the "glue" between them. They typically represent:
 * - Short blocks at intersections
 * - Transitions between different road types
 * - Complex intersection crossings
 *
 * Connectors are first-class entities in the network to enable:
 * - Clean graph structure for routing (corridors + connectors as nodes)
 * - Scoring of transitions (e.g., "this connector crosses a busy road")
 * - Persistence alongside corridors in the database
 */
export interface ConnectorAttributes {
  /** Total length in meters */
  lengthMeters: number;
  /** Does this connector cross a major road? */
  crossesMajorRoad: boolean;
  /** Is there a traffic signal at this connector? */
  hasSignal: boolean;
  /** Is there a stop sign? */
  hasStop: boolean;
  /** Estimated crossing difficulty (0-1, higher = harder) */
  crossingDifficulty: number;
}

/** A connector - short segment linking corridors */
export interface Connector {
  id: string;
  /** Edge IDs that make up this connector */
  edgeIds: string[];
  /** Corridor IDs this connects (usually 2, but can be 3+ at complex intersections) */
  corridorIds: string[];
  /** Start node ID */
  startNodeId: string;
  /** End node ID */
  endNodeId: string;
  /** Attributes for scoring */
  attributes: ConnectorAttributes;
  /** Geometry for display */
  geometry: Coordinate[];
}

/**
 * A collection of corridors and connectors for a region.
 *
 * This forms a graph where:
 * - Corridors are the "main" segments (long stretches)
 * - Connectors are the "links" between corridors (short transitions)
 *
 * Routing operates on this abstraction rather than the raw edge graph.
 */
export interface CorridorNetwork {
  corridors: Map<string, Corridor>;
  connectors: Map<string, Connector>;
  /**
   * Adjacency list for the corridor/connector graph.
   * Maps corridor/connector ID → IDs of adjacent corridors/connectors.
   * Both corridors and connectors appear as keys and values.
   */
  adjacency: Map<string, string[]>;
}
