/**
 * Extract graph attributes from OSM tags.
 *
 * These functions convert OSM's tag key-value pairs into our
 * domain types (RoadClass, SurfaceClassification, Infrastructure, etc.)
 */

import type {
  Infrastructure,
  RoadClass,
  SurfaceClassification,
  SurfaceType
} from "@tailwind-loops/types";
import type { OsmTags, RelevantHighway } from "./types.js";
import { isRelevantHighway } from "./types.js";

/**
 * Map OSM highway tag to our RoadClass.
 */
const HIGHWAY_TO_ROAD_CLASS: Record<RelevantHighway, RoadClass> = {
  trunk: "trunk",
  trunk_link: "trunk",
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
  track: "track"
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
  asphalt: "paved",
  paved: "paved",
  concrete: "paved",
  "concrete:plates": "paved",
  "concrete:lanes": "paved",
  paving_stones: "paved",
  sett: "paved",
  metal: "paved",

  // Gravel/compacted surfaces
  gravel: "unpaved",
  fine_gravel: "unpaved",
  compacted: "unpaved",
  pebblestone: "unpaved",
  cobblestone: "unpaved",

  // Dirt/earth surfaces
  dirt: "unpaved",
  earth: "unpaved",
  ground: "unpaved",
  mud: "unpaved",

  // Other unpaved surfaces
  unpaved: "unpaved",
  sand: "unpaved",
  grass: "unpaved",
  grass_paver: "unpaved",
  wood: "unpaved",
  woodchips: "unpaved"
};

/**
 * Infer surface from highway type when no explicit surface tag.
 * These have lower confidence as they're generalizations.
 */
const HIGHWAY_INFERRED_SURFACE: Partial<Record<RoadClass, SurfaceType>> = {
  trunk: "paved",
  primary: "paved",
  secondary: "paved",
  tertiary: "paved",
  residential: "paved",
  service: "paved",
  cycleway: "paved",
  footway: "paved",
  track: "unpaved",
  path: "unknown",
  unclassified: "unknown"
};

/** Confidence for explicit OSM surface tag */
const EXPLICIT_SURFACE_CONFIDENCE = 0.8;

/** Confidence for surface inferred from highway type */
const INFERRED_SURFACE_CONFIDENCE = 0.3;

/**
 * Extract surface information from OSM tags.
 *
 * Returns a SurfaceClassification with:
 * - High confidence (0.8) for explicit surface=* tags
 * - Low confidence (0.3) for inference from highway type
 *
 * @param tags - OSM tags object
 * @param roadClass - Already extracted road class (for inference fallback)
 * @returns SurfaceClassification
 */
export function extractSurface(
  tags: OsmTags | undefined,
  roadClass?: RoadClass
): SurfaceClassification {
  // Check for explicit surface tag first
  const surfaceTag = tags?.["surface"];
  if (surfaceTag) {
    const surfaceType = SURFACE_TAG_MAP[surfaceTag];
    if (surfaceType) {
      return {
        surface: surfaceType,
        confidence: EXPLICIT_SURFACE_CONFIDENCE,
        hasConflict: false,
      };
    }
  }

  // Fall back to highway inference
  const effectiveRoadClass = roadClass ?? extractRoadClass(tags);
  const inferredSurface = HIGHWAY_INFERRED_SURFACE[effectiveRoadClass];

  return {
    surface: inferredSurface ?? "unknown",
    confidence: INFERRED_SURFACE_CONFIDENCE,
    hasConflict: false,
  };
}

/** Values on cycleway/cycleway:* tags that indicate a dedicated bike lane or path */
const CYCLEWAY_DEDICATED = new Set(["lane", "track", "shared_lane", "shared_busway"]);

/** Values on cycleway/cycleway:* tags that indicate physical separation from traffic */
const CYCLEWAY_SEPARATED = new Set(["track", "separate"]);

/**
 * Read the effective cycleway value, considering cycleway, cycleway:left,
 * cycleway:right, and cycleway:both tags.  Returns an array of all non-empty
 * values found (typically 1-2 entries).
 */
function collectCyclewayValues(tags: OsmTags): string[] {
  const vals: string[] = [];
  for (const key of ["cycleway", "cycleway:left", "cycleway:right", "cycleway:both"] as const) {
    const v = tags[key];
    if (v && v !== "no" && v !== "none") vals.push(v);
  }
  return vals;
}

/**
 * Extract infrastructure information from OSM tags.
 *
 * Determines:
 * - hasBicycleInfra: bike lane, cycle track, cycleway, bicycle-designated route
 * - hasPedestrianPath: footway, pedestrian area, generic path
 * - hasShoulder: paved shoulder available
 * - isSeparated: physically separated from motor traffic
 * - hasTrafficCalming: traffic calming measures present
 *
 * @param tags - OSM tags object
 * @returns Infrastructure flags
 */
export function extractInfrastructure(tags: OsmTags | undefined): Infrastructure {
  if (!tags) {
    return {
      hasBicycleInfra: false,
      hasPedestrianPath: false,
      hasShoulder: false,
      isSeparated: false,
      hasTrafficCalming: false,
    };
  }

  const highway = tags["highway"];
  const bicycle = tags["bicycle"];
  const sidewalk = tags["sidewalk"];
  const shoulder = tags["shoulder"];
  const segregated = tags["segregated"];
  const bicycleRoad = tags["bicycle_road"];
  const cyclestreet = tags["cyclestreet"];
  const trafficCalming = tags["traffic_calming"];

  // Collect all cycleway tag values (cycleway, cycleway:left/right/both)
  const cwValues = collectCyclewayValues(tags);

  // Bicycle infrastructure: bike lanes, cycle tracks, dedicated cycleways
  const hasBicycleInfra =
    highway === "cycleway" ||
    cwValues.some((v) => CYCLEWAY_DEDICATED.has(v)) ||
    bicycle === "designated" ||
    bicycleRoad === "yes" ||
    cyclestreet === "yes";

  // Pedestrian path: footways, sidewalks, generic paths
  // highway=path with bicycle=designated is bike infra, not ped path
  const hasPedestrianPath =
    highway === "footway" ||
    highway === "pedestrian" ||
    (highway === "path" && bicycle !== "designated");

  // Shoulder: usable shoulder exists
  const hasShoulder =
    shoulder === "yes" || shoulder === "both" || shoulder === "left" || shoulder === "right";

  // Separated: physically separated from motor traffic
  const isSeparated =
    highway === "cycleway" ||
    highway === "path" ||
    highway === "footway" ||
    highway === "pedestrian" ||
    cwValues.some((v) => CYCLEWAY_SEPARATED.has(v)) ||
    segregated === "yes" ||
    sidewalk === "separate";

  // Traffic calming: speed bumps, chicanes, raised crossings, etc.
  const hasTrafficCalming =
    (trafficCalming != null && trafficCalming !== "no") || highway === "living_street";

  return {
    hasBicycleInfra,
    hasPedestrianPath,
    hasShoulder,
    isSeparated,
    hasTrafficCalming,
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

/**
 * Extract scenic designation from OSM tags.
 *
 * Checks for the `scenic=yes` tag on the way.
 *
 * @param tags - OSM tags object
 * @returns true if the way is designated as scenic
 */
export function extractScenicDesignation(tags: OsmTags | undefined): boolean {
  return tags?.["scenic"] === "yes";
}
