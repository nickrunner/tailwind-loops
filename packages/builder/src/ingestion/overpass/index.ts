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
} from "./query.js";
export { parseOverpassResponse } from "./parser.js";
