/**
 * Overpass API query construction and execution.
 *
 * Generates Overpass QL queries for routing-relevant data and fetches
 * results via the overpass-ts client.
 */

import type { BoundingBox } from "@tailwind-loops/types";
import { overpassJson } from "overpass-ts";
import type { OverpassJson, OverpassOptions as OverpassTsOptions } from "overpass-ts";
import { RELEVANT_HIGHWAYS } from "../osm/types.js";

/** Options for Overpass API requests */
export interface OverpassOptions {
  /** Overpass API endpoint URL (for self-hosted instances) */
  endpoint?: string;
  /** Query timeout in seconds (default: 90) */
  timeout?: number;
  /** User-agent string */
  userAgent?: string;
}

const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_TIMEOUT = 90;

/**
 * Build an Overpass QL query for routing-relevant data within a bbox.
 *
 * Fetches:
 * - Ways with highway tags relevant for cycling/running/walking
 * - Nodes with traffic_signals, stop, or crossing tags
 *
 * Uses `out body geom;` to get inline geometry on ways, avoiding
 * a two-pass approach.
 *
 * @param bbox - Bounding box (WGS84)
 * @param timeout - Query timeout in seconds
 * @returns Overpass QL query string
 */
export function buildOverpassQuery(
  bbox: BoundingBox,
  timeout: number = DEFAULT_TIMEOUT
): string {
  // Overpass bbox format: (south, west, north, east)
  const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;

  // Build highway regex from RELEVANT_HIGHWAYS
  const highwayRegex = `^(${RELEVANT_HIGHWAYS.join("|")})$`;

  return `[out:json][timeout:${timeout}];
(
  way["highway"~"${highwayRegex}"](${bboxStr});
  node["highway"~"^(traffic_signals|stop|crossing)$"](${bboxStr});
);
out body geom;`;
}

/**
 * Fetch routing data from the Overpass API for a bounding box.
 *
 * @param bbox - Bounding box to query
 * @param options - API options (endpoint, timeout)
 * @returns Raw Overpass JSON response
 */
export async function fetchOverpassData(
  bbox: BoundingBox,
  options?: OverpassOptions
): Promise<OverpassJson> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const query = buildOverpassQuery(bbox, timeout);

  const overpassOpts: Partial<OverpassTsOptions> = {
    endpoint: options?.endpoint ?? DEFAULT_ENDPOINT,
  };
  if (options?.userAgent) {
    overpassOpts.userAgent = options.userAgent;
  }

  return overpassJson(query, overpassOpts);
}
