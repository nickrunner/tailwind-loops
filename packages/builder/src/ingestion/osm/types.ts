/**
 * OSM-specific types for parsing PBF data.
 *
 * These types represent the raw data from OSM before transformation
 * into our domain Graph types.
 */

/** OSM tags as key-value pairs */
export type OsmTags = Record<string, string>;

/** A node from OSM - represents a point location */
export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: OsmTags;
}

/** A way from OSM - represents a linear feature (road, path, etc.) */
export interface OsmWay {
  type: "way";
  id: number;
  /** Ordered list of node IDs that make up this way */
  refs: number[];
  tags?: OsmTags;
}

/** A relation from OSM - for future use (route relations, etc.) */
export interface OsmRelation {
  type: "relation";
  id: number;
  members: {
    type: "node" | "way" | "relation";
    ref: number;
    role: string;
  }[];
  tags?: OsmTags;
}

/** Union of all OSM element types */
export type OsmElement = OsmNode | OsmWay | OsmRelation;

/**
 * Highway tag values relevant for cycling/running/walking.
 *
 * We explicitly list the values we care about to:
 * 1. Filter out irrelevant roads (motorways, etc.)
 * 2. Map to our RoadClass type
 */
export const RELEVANT_HIGHWAYS = [
  // Major roads (cyclists may need to use)
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  // Residential
  "residential",
  "living_street",
  // Service
  "service",
  // Dedicated infrastructure
  "cycleway",
  "path",
  "footway",
  "pedestrian",
  "bridleway",
  "steps",
  // Unpaved
  "track",
] as const;

export type RelevantHighway = (typeof RELEVANT_HIGHWAYS)[number];

/**
 * Check if a highway tag value is one we care about.
 */
export function isRelevantHighway(highway: string | undefined): highway is RelevantHighway {
  if (!highway) return false;
  return RELEVANT_HIGHWAYS.includes(highway as RelevantHighway);
}

/**
 * Highway types we explicitly exclude.
 * These are never suitable for human-powered activities.
 */
export const EXCLUDED_HIGHWAYS = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "construction",
  "proposed",
  "abandoned",
  "razed",
] as const;

export type ExcludedHighway = (typeof EXCLUDED_HIGHWAYS)[number];
