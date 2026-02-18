/**
 * Generalized data enrichment types.
 *
 * Extends the surface-only provider/fusion pattern to support enriching
 * any edge attribute from multiple external data sources, with per-attribute
 * confidence tracking that flows through corridor aggregation into scoring.
 */

import type { SurfaceType } from "./graph.js";

// ---------------------------------------------------------------------------
// Enrichable attributes
// ---------------------------------------------------------------------------

/** Attributes that can be enriched from external data sources */
export type EnrichableAttribute =
  | "surface"
  | "speed-limit"
  | "stop-sign"
  | "traffic-signal"
  | "road-crossing"
  | "bicycle-infra"
  | "traffic-calming"
  | "scenic";

/** Maps each enrichable attribute to the value type its observations carry */
export interface AttributeValueMap {
  "surface": SurfaceType;
  "speed-limit": number;
  "stop-sign": PointDetection;
  "traffic-signal": PointDetection;
  "road-crossing": PointDetection;
  "bicycle-infra": boolean;
  "traffic-calming": boolean;
  "scenic": number;
}

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

/** Generalized source identifier for any enrichment data */
export type DataSource =
  | "osm-tag"
  | "osm-inferred"
  | "gravelmap"
  | "mapillary"
  | "google-roads"
  | "municipal-open-data"
  | "user-report";

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

/** A point-based detection (signs, signals, crossings) */
export interface PointDetection {
  coordinate: { lat: number; lng: number };
  detectionConfidence: number;
}

/** A single observation of an attribute from a data source */
export interface Observation<A extends EnrichableAttribute = EnrichableAttribute> {
  attribute: A;
  source: DataSource;
  value: AttributeValueMap[A];
  /** Source-reported confidence (0-1) */
  sourceConfidence: number;
  /** When this observation was recorded */
  observedAt?: Date;
  /** Geometry associated with the observation (point or linestring) */
  geometry?: { lat: number; lng: number }[];
}

// ---------------------------------------------------------------------------
// Enrichment metadata (per-edge, per-attribute)
// ---------------------------------------------------------------------------

/** Per-attribute enrichment result stored on an edge */
export interface AttributeEnrichment {
  /** Fused confidence in the resolved value (0-1) */
  confidence: number;
  /** Whether sources conflict for this attribute */
  hasConflict: boolean;
  /** Raw observations that contributed to the fused value */
  observations: Observation[];
}

/** Enrichment metadata bag attached to an edge */
export type EdgeEnrichment = Partial<Record<EnrichableAttribute, AttributeEnrichment>>;

// ---------------------------------------------------------------------------
// Corridor-level confidence
// ---------------------------------------------------------------------------

/** Per-dimension confidence scores aggregated across a corridor's edges */
export interface CorridorConfidence {
  /** Surface classification confidence (length-weighted average) */
  surface: number;
  /** Speed limit data confidence (length-weighted average) */
  speedLimit: number;
  /** Traffic control data confidence (stop signs, signals, crossings) */
  trafficControl: number;
  /** Bicycle infrastructure data confidence */
  infrastructure: number;
  /** Scenic designation data confidence */
  scenic: number;
}
