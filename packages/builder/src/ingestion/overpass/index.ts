/**
 * Overpass API ingestion module.
 *
 * Provides an alternative to PBF-based ingestion by querying the Overpass API
 * for routing-relevant data within a bounding box.
 */

export {
  buildOverpassQuery,
  fetchOverpassData,
  type OverpassOptions,
  type OverpassResult,
} from "./query.js";
export { parseOverpassResponse } from "./parser.js";
export {
  DEFAULT_TILE_SIZE,
  type TileCoord,
  tileForPoint,
  tileBbox,
  tileForBbox,
  tileCacheKey,
  readCachedResponse,
  writeCachedResponse,
  getCachePath,
} from "./cache.js";
