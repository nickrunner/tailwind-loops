/**
 * @tailwind-loops/builder
 *
 * Core logic library for building corridor networks from OSM data.
 *
 * Pipeline:
 * 1. Download PBF from Geofabrik (or use local file)
 * 2. Ingest OSM data -> Graph
 * 3. Build corridors from graph -> CorridorNetwork (without scores)
 *
 * Scoring is handled separately by @tailwind-loops/routing.
 */

// Ingestion
export {
  ingestOsm,
  ingestFromOverpass,
  ingest,
  type BoundingBox,
  type OsmIngestionOptions,
  type IngestionOptions,
  type SurfaceStats,
  type IngestionResult,
} from "./ingestion/index.js";

// OSM parsing
export {
  parseOsmPbf,
  countPbfElements,
  type ParseOptions,
  buildGraphFromOsm,
  haversineDistance,
  calculatePathLength,
  type GraphBuildResult,
  type GraphBuildStats,
  extractRoadClass,
  extractSurface,
  extractInfrastructure,
  extractOneWay,
  isReverseOneWay,
  extractSpeedLimit,
  extractLanes,
  extractName,
  type OsmNode,
  type OsmWay,
  type OsmRelation,
  type OsmElement,
  type OsmTags,
  type RelevantHighway,
  RELEVANT_HIGHWAYS,
  EXCLUDED_HIGHWAYS,
  isRelevantHighway,
} from "./ingestion/osm/index.js";

// Corridor building
export {
  buildCorridors,
  classifyCorridor,
  type CorridorBuilderOptions,
  type CorridorBuildResult,
  DEFAULT_CORRIDOR_OPTIONS,
  edgeCompatibility,
  buildChains,
  getCounterpartEdgeId,
  computeUndirectedDegree,
  trimDeadEnds,
  type EdgeChain,
  aggregateAttributes,
  deriveName,
  buildCorridorGeometry,
  douglasPeucker,
} from "./corridors/index.js";

// Overpass API
export {
  buildOverpassQuery,
  fetchOverpassData,
  parseOverpassResponse,
  type OverpassOptions,
  type OverpassResult,
} from "./ingestion/overpass/index.js";

// Location-based corridor building
export {
  buildCorridorsForLocation,
  bboxFromCenter,
  expandBbox,
  type LocationBuildOptions,
} from "./location/index.js";

// Elevation
export {
  enrichElevation,
  type ElevationEnrichmentOptions,
  type ElevationStats,
  DemReader,
  type DemConfig,
} from "./elevation/index.js";

// Enrichment
export {
  enrichGraph,
  type EnrichmentOptions,
  type EnrichmentStats,
  EdgeSpatialIndex,
  MapillaryProvider,
  type MapillaryProviderOptions,
  HeiGitSurfaceProvider,
  type HeiGitSurfaceProviderOptions,
} from "./enrichment/index.js";
export type { EnrichmentProvider } from "./enrichment/index.js";

// Geofabrik
export {
  type GeofabrikRegion,
  US_STATES,
  getRegionUrl,
  resolveRegion,
  downloadPbf,
  type DownloadOptions,
} from "./geofabrik/index.js";
