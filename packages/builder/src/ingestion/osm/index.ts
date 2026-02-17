/**
 * OSM parsing module.
 *
 * Provides functionality to parse OSM PBF files and build a Graph.
 */

export { parseOsmPbf, countPbfElements, type ParseOptions } from "./parser.js";
export {
  buildGraphFromOsm,
  haversineDistance,
  calculatePathLength,
  type GraphBuildResult,
  type GraphBuildStats,
} from "./graph-builder.js";
export {
  extractRoadClass,
  extractSurface,
  extractInfrastructure,
  extractOneWay,
  isReverseOneWay,
  extractSpeedLimit,
  extractLanes,
  extractName,
} from "./tag-extractors.js";
export {
  type OsmNode,
  type OsmWay,
  type OsmRelation,
  type OsmElement,
  type OsmTags,
  type RelevantHighway,
  RELEVANT_HIGHWAYS,
  EXCLUDED_HIGHWAYS,
  isRelevantHighway,
} from "./types.js";
