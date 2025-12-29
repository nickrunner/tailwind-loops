/**
 * Low-level graph representation built from OSM data.
 *
 * The graph represents the raw street network with nodes at intersections
 * and edges representing street segments. This is the foundation layer
 * that corridors are derived from.
 */

/** Geographic coordinate (WGS84) */
export interface Coordinate {
  lat: number;
  lng: number;
}

/** A node in the graph, typically an intersection or endpoint */
export interface GraphNode {
  id: string;
  coordinate: Coordinate;
  /** OSM node ID if sourced from OSM */
  osmId?: string;
}

/** Road classification from OSM highway tag or equivalent */
export type RoadClass =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "residential"
  | "service"
  | "path"
  | "cycleway"
  | "footway"
  | "track"
  | "unclassified";

/** Surface type classification */
export type SurfaceType =
  | "paved"
  | "asphalt"
  | "concrete"
  | "gravel"
  | "dirt"
  | "unpaved"
  | "unknown";

/** Data sources for surface information */
export type SurfaceDataSource =
  | "osm-surface-tag" // Explicit OSM surface=* tag
  | "osm-highway-inferred" // Inferred from highway type
  | "gravelmap" // Gravelmap.com crowd-sourced data
  | "strava-heatmap" // Strava usage patterns by bike type
  | "user-report" // User-submitted correction
  | "satellite-ml"; // ML classification from satellite imagery

/** A surface observation from a single data source */
export interface SurfaceObservation {
  source: SurfaceDataSource;
  surface: SurfaceType;
  /** When this observation was recorded (if known) */
  observedAt?: Date;
  /** Source-specific confidence (0-1) */
  sourceConfidence: number;
}

/**
 * Surface classification with confidence scoring.
 *
 * Surface type is the most critical attribute for cycling routing.
 * We fuse multiple data sources to build confidence in classifications.
 */
export interface SurfaceClassification {
  /** The resolved surface type */
  surface: SurfaceType;
  /**
   * Confidence in this classification (0-1)
   * - 0.0-0.3: Single low-quality source or inference only
   * - 0.3-0.6: Single explicit source or multiple weak sources
   * - 0.6-0.8: Multiple agreeing sources
   * - 0.8-1.0: High-quality source or strong multi-source agreement
   */
  confidence: number;
  /** All observations that contributed to this classification */
  observations: SurfaceObservation[];
  /** Flag if sources conflict (manual review may be needed) */
  hasConflict: boolean;
}

/** Infrastructure for human-powered activities */
export interface Infrastructure {
  /** Dedicated path/lane (bike lane, sidewalk, etc.) */
  hasDedicatedPath: boolean;
  /** Shoulder present and usable */
  hasShoulder: boolean;
  /** Separated from motor traffic */
  isSeparated: boolean;
}

/** Attributes of a graph edge derived from source data */
export interface EdgeAttributes {
  /** Road classification */
  roadClass: RoadClass;
  /** Surface classification with confidence */
  surfaceClassification: SurfaceClassification;
  /** Number of lanes (if known) */
  lanes?: number;
  /** Speed limit in km/h (if known) */
  speedLimit?: number;
  /** Name of the road/path */
  name?: string;
  /** Infrastructure available */
  infrastructure: Infrastructure;
  /** Is this a one-way segment? */
  oneWay: boolean;
  /** Length in meters */
  lengthMeters: number;
}

/** Convenience accessor for surface type (most common use case) */
export function getSurface(attrs: EdgeAttributes): SurfaceType {
  return attrs.surfaceClassification.surface;
}

/** Convenience accessor for surface confidence */
export function getSurfaceConfidence(attrs: EdgeAttributes): number {
  return attrs.surfaceClassification.confidence;
}

/** A directed edge in the graph connecting two nodes */
export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  attributes: EdgeAttributes;
  /** OSM way ID if sourced from OSM */
  osmWayId?: string;
  /** Geometry as array of coordinates (for rendering/snapping) */
  geometry: Coordinate[];
}

/** The complete graph structure */
export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  /** Adjacency list: nodeId -> outgoing edgeIds */
  adjacency: Map<string, string[]>;
}
