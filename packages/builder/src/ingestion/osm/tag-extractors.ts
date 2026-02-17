/**
 * Extract graph attributes from OSM tags.
 *
 * These functions convert OSM's tag key-value pairs into our
 * domain types (RoadClass, SurfaceObservation, Infrastructure, etc.)
 */

import type {
  Infrastructure,
  RoadClass,
  SurfaceObservation,
  SurfaceType,
} from "@tailwind-loops/types";
import type { OsmTags, RelevantHighway } from "./types.js";
import { isRelevantHighway } from "./types.js";

/**
 * Map OSM highway tag to our RoadClass.
 */
const HIGHWAY_TO_ROAD_CLASS: Record<RelevantHighway, RoadClass> = {
  primary: "primary",
  primary_link: "primary",
  secondary: "secondary",
  secondary_link: "secondary",
  tertiary: "tertiary",
  tertiary_link: "tertiary",
  unclassified: "unclassified",
  residential: "residential",
  living_street: "residential",
  service: "service",
  cycleway: "cycleway",
  path: "path",
  footway: "footway",
  pedestrian: "footway",
  bridleway: "path",
  steps: "footway",
  track: "track",
};

/**
 * Extract RoadClass from OSM tags.
 *
 * @param tags - OSM tags object
 * @returns The road class, or "unclassified" if not determinable
 */
export function extractRoadClass(tags: OsmTags | undefined): RoadClass {
  if (!tags) return "unclassified";

  const highway = tags["highway"];
  if (isRelevantHighway(highway)) {
    return HIGHWAY_TO_ROAD_CLASS[highway];
  }

  return "unclassified";
}

/**
 * Map OSM surface tag to our SurfaceType.
 * These are explicit surface tags with high confidence.
 */
const SURFACE_TAG_MAP: Record<string, SurfaceType> = {
  // Paved surfaces
  asphalt: "asphalt",
  paved: "paved",
  concrete: "concrete",
  "concrete:plates": "concrete",
  "concrete:lanes": "concrete",
  paving_stones: "paved",
  sett: "paved",
  cobblestone: "paved",
  metal: "paved",

  // Gravel/compacted surfaces
  gravel: "gravel",
  fine_gravel: "gravel",
  compacted: "gravel",
  pebblestone: "gravel",

  // Dirt/earth surfaces
  dirt: "dirt",
  earth: "dirt",
  ground: "dirt",
  mud: "dirt",

  // Other unpaved surfaces
  unpaved: "unpaved",
  sand: "unpaved",
  grass: "unpaved",
  grass_paver: "unpaved",
  wood: "unpaved",
  woodchips: "unpaved",
};

/**
 * Infer surface from highway type when no explicit surface tag.
 * These have lower confidence as they're generalizations.
 */
const HIGHWAY_INFERRED_SURFACE: Partial<Record<RoadClass, SurfaceType>> = {
  primary: "paved",
  secondary: "paved",
  tertiary: "paved",
  residential: "paved",
  service: "paved",
  cycleway: "paved",
  footway: "paved",
  track: "unpaved",
  path: "unknown",
  unclassified: "unknown",
};

/** Confidence for explicit OSM surface tag */
const EXPLICIT_SURFACE_CONFIDENCE = 0.8;

/** Confidence for surface inferred from highway type */
const INFERRED_SURFACE_CONFIDENCE = 0.3;

/**
 * Extract surface information from OSM tags.
 *
 * Returns a SurfaceObservation with:
 * - High confidence (0.8) for explicit surface=* tags
 * - Low confidence (0.3) for inference from highway type
 *
 * @param tags - OSM tags object
 * @param roadClass - Already extracted road class (for inference fallback)
 * @returns SurfaceObservation
 */
export function extractSurface(
  tags: OsmTags | undefined,
  roadClass?: RoadClass
): SurfaceObservation {
  // Check for explicit surface tag first
  const surfaceTag = tags?.["surface"];
  if (surfaceTag) {
    const surfaceType = SURFACE_TAG_MAP[surfaceTag];
    if (surfaceType) {
      return {
        source: "osm-surface-tag",
        surface: surfaceType,
        sourceConfidence: EXPLICIT_SURFACE_CONFIDENCE,
      };
    }
  }

  // Fall back to highway inference
  const effectiveRoadClass = roadClass ?? extractRoadClass(tags);
  const inferredSurface = HIGHWAY_INFERRED_SURFACE[effectiveRoadClass];

  return {
    source: "osm-highway-inferred",
    surface: inferredSurface ?? "unknown",
    sourceConfidence: INFERRED_SURFACE_CONFIDENCE,
  };
}

/**
 * Extract infrastructure information from OSM tags.
 *
 * Determines:
 * - hasDedicatedPath: bike lane, cycle track, or dedicated path
 * - hasShoulder: paved shoulder available
 * - isSeparated: physically separated from motor traffic
 *
 * @param tags - OSM tags object
 * @returns Infrastructure flags
 */
export function extractInfrastructure(tags: OsmTags | undefined): Infrastructure {
  if (!tags) {
    return {
      hasDedicatedPath: false,
      hasShoulder: false,
      isSeparated: false,
    };
  }

  const highway = tags["highway"];
  const cycleway = tags["cycleway"];
  const bicycle = tags["bicycle"];
  const sidewalk = tags["sidewalk"];
  const shoulder = tags["shoulder"];
  const segregated = tags["segregated"];

  // Dedicated path: dedicated cycling/walking infrastructure
  const hasDedicatedPath =
    highway === "cycleway" ||
    highway === "path" ||
    highway === "footway" ||
    highway === "pedestrian" ||
    cycleway === "lane" ||
    cycleway === "track" ||
    cycleway === "shared_lane" ||
    bicycle === "designated";

  // Shoulder: usable shoulder exists
  const hasShoulder =
    shoulder === "yes" ||
    shoulder === "both" ||
    shoulder === "left" ||
    shoulder === "right";

  // Separated: physically separated from motor traffic
  const isSeparated =
    highway === "cycleway" ||
    highway === "path" ||
    highway === "footway" ||
    highway === "pedestrian" ||
    cycleway === "track" ||
    cycleway === "separate" ||
    segregated === "yes" ||
    sidewalk === "separate";

  return {
    hasDedicatedPath,
    hasShoulder,
    isSeparated,
  };
}

/**
 * Extract one-way information from OSM tags.
 *
 * Handles:
 * - oneway=yes|no|-1
 * - junction=roundabout (implicit one-way)
 * - Cycleways with oneway:bicycle
 *
 * @param tags - OSM tags object
 * @returns true if one-way in direction of way, false if bidirectional
 */
export function extractOneWay(tags: OsmTags | undefined): boolean {
  if (!tags) return false;

  const oneway = tags["oneway"];
  const junction = tags["junction"];

  // Roundabouts are implicitly one-way
  if (junction === "roundabout") return true;

  // Explicit one-way tag
  if (oneway === "yes" || oneway === "true" || oneway === "1") return true;

  // Reverse one-way (still one-way, just opposite direction)
  // We'll handle the direction reversal in graph building
  if (oneway === "-1" || oneway === "reverse") return true;

  return false;
}

/**
 * Check if a way has reverse one-way direction.
 * Used during graph building to create edges in the correct direction.
 */
export function isReverseOneWay(tags: OsmTags | undefined): boolean {
  if (!tags) return false;
  const oneway = tags["oneway"];
  return oneway === "-1" || oneway === "reverse";
}

/**
 * Extract speed limit from OSM tags.
 *
 * Parses various formats:
 * - "50" (assumed km/h)
 * - "30 mph" (converted to km/h)
 * - "walk" (5 km/h)
 *
 * @param tags - OSM tags object
 * @returns Speed limit in km/h, or undefined if not specified
 */
export function extractSpeedLimit(tags: OsmTags | undefined): number | undefined {
  const maxspeed = tags?.["maxspeed"];
  if (!maxspeed) return undefined;

  // Handle special values
  if (maxspeed === "walk" || maxspeed === "walking") return 5;
  if (maxspeed === "none") return undefined;

  // Try to parse numeric value
  const match = maxspeed.match(/^(\d+)\s*(mph|km\/h|kmh)?$/i);
  if (!match || !match[1]) return undefined;

  const value = parseInt(match[1], 10);
  if (isNaN(value)) return undefined;

  const unit = match[2]?.toLowerCase();

  // Convert mph to km/h
  if (unit === "mph") {
    return Math.round(value * 1.60934);
  }

  // Default to km/h
  return value;
}

/**
 * Extract lane count from OSM tags.
 *
 * @param tags - OSM tags object
 * @returns Number of lanes, or undefined if not specified
 */
export function extractLanes(tags: OsmTags | undefined): number | undefined {
  const lanesTag = tags?.["lanes"];
  if (!lanesTag) return undefined;

  const lanes = parseInt(lanesTag, 10);
  return isNaN(lanes) ? undefined : lanes;
}

/**
 * Extract road/path name from OSM tags.
 *
 * Prefers name, falls back to ref (road number) or official_name.
 *
 * @param tags - OSM tags object
 * @returns Name string or undefined
 */
export function extractName(tags: OsmTags | undefined): string | undefined {
  if (!tags) return undefined;
  return tags["name"] ?? tags["ref"] ?? tags["official_name"];
}
