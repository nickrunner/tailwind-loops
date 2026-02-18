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
import { tileForBbox, readCachedResponse, writeCachedResponse } from "./cache.js";

/** Result from fetchOverpassData, includes the actual tile bbox that was fetched */
export interface OverpassResult {
  data: OverpassJson;
  /** The actual bbox fetched (the tile bbox, may differ from the requested bbox) */
  fetchedBbox: BoundingBox;
}

/** Options for Overpass API requests */
export interface OverpassOptions {
  /** Overpass API endpoint URL (for self-hosted instances) */
  endpoint?: string;
  /** Query timeout in seconds (default: 90) */
  timeout?: number;
  /** User-agent string */
  userAgent?: string;
  /** Bypass cache read (still writes to cache) */
  force?: boolean;
  /** Override the cache directory (default: ~/.tailwind-loops/overpass-cache/) */
  cacheDir?: string;
  /** Disable caching entirely (no read or write) */
  noCache?: boolean;
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
 * The bbox center is mapped to a fixed-size tile on a regular grid.
 * The tile's bbox is used for both the cache key and the Overpass query,
 * so nearby requests always hit the same cache entry regardless of zoom.
 *
 * @param bbox - Bounding box to query
 * @param options - API options (endpoint, timeout)
 * @returns Overpass JSON response and the actual tile bbox that was fetched
 */
export async function fetchOverpassData(
  bbox: BoundingBox,
  options?: OverpassOptions
): Promise<OverpassResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const useCache = !options?.noCache;

  // Map bbox center to a fixed tile on the grid
  const { tile, bbox: fetchBbox } = tileForBbox(bbox);

  // Check cache
  if (useCache && !options?.force) {
    const cached = readCachedResponse(tile, timeout, options?.cacheDir);
    if (cached) return { data: cached, fetchedBbox: fetchBbox };
  }

  // Fetch from API using the tile's fixed bbox
  const query = buildOverpassQuery(fetchBbox, timeout);

  const overpassOpts: Partial<OverpassTsOptions> = {
    endpoint: options?.endpoint ?? DEFAULT_ENDPOINT,
  };
  if (options?.userAgent) {
    overpassOpts.userAgent = options.userAgent;
  }

  const data = await overpassJson(query, overpassOpts);

  // Write to cache
  if (useCache) {
    writeCachedResponse(tile, timeout, data, options?.cacheDir);
  }

  return { data, fetchedBbox: fetchBbox };
}
