/**
 * Data ingestion module.
 *
 * Responsible for building the graph from multiple data sources:
 * 1. OSM provides the geometric foundation (nodes, edges, road classification)
 * 2. Surface data providers enrich edges with surface confidence
 *
 * Pipeline:
 * OSM PBF -> Base Graph -> Surface Enrichment -> Final Graph
 */

import type {
  Graph,
  Coordinate,
  GraphEdge,
  SurfaceObservation,
  SurfaceClassification,
  SurfaceDataSource,
  SurfaceType,
  BoundingBox,
} from "@tailwind-loops/types";
import { parseOsmPbf, buildGraphFromOsm } from "./osm/index.js";
import { fetchOverpassData, parseOverpassResponse } from "./overpass/index.js";
import type { OverpassOptions } from "./overpass/index.js";

// Re-export BoundingBox from types for backward compatibility
export type { BoundingBox } from "@tailwind-loops/types";

/**
 * A provider of surface data for graph enrichment.
 *
 * Implementations include:
 * - GravelmapProvider: Fetches from gravelmap.com API
 * - StravaHeatmapProvider: Analyzes Strava usage patterns
 * - etc.
 */
export interface SurfaceDataProvider {
  /** Unique identifier for this provider */
  readonly source: SurfaceDataSource;

  /** Human-readable name */
  readonly name: string;

  /**
   * Fetch surface observations for edges within a bounding box.
   *
   * Returns a map of edge geometry hash -> observation.
   * The geometry hash allows matching provider data to graph edges.
   */
  fetchObservations(
    bounds: BoundingBox
  ): Promise<Map<string, SurfaceObservation>>;

  /**
   * Match an edge to provider data and return an observation if found.
   *
   * @param edge - The graph edge to match
   * @returns Surface observation if the provider has data for this edge
   */
  matchEdge(edge: GraphEdge): Promise<SurfaceObservation | null>;
}

/** Options for OSM ingestion (base graph) */
export interface OsmIngestionOptions {
  /** Path to OSM PBF file */
  pbfPath: string;
  /** Optional bounding box to filter (if not using pre-clipped extract) */
  bounds?: BoundingBox;
  /** Include only ways suitable for the given activities */
  activities?: ("cycling" | "running" | "walking")[];
}

/** Options for the full ingestion pipeline */
export interface IngestionOptions {
  /** OSM source configuration */
  osm: OsmIngestionOptions;
  /** Surface data providers to use for enrichment */
  surfaceProviders?: SurfaceDataProvider[];
}

/** Statistics about surface data quality */
export interface SurfaceStats {
  /** Edges with high confidence (>0.7) */
  highConfidenceCount: number;
  /** Edges with medium confidence (0.4-0.7) */
  mediumConfidenceCount: number;
  /** Edges with low confidence (<0.4) */
  lowConfidenceCount: number;
  /** Edges with conflicting sources */
  conflictCount: number;
  /** Breakdown by surface type */
  bySurfaceType: Record<SurfaceType, number>;
}

/** Result of ingestion */
export interface IngestionResult {
  graph: Graph;
  /** Statistics about the ingestion */
  stats: {
    nodesCount: number;
    edgesCount: number;
    totalLengthMeters: number;
    ingestionTimeMs: number;
    /** Surface data quality stats */
    surface: SurfaceStats;
  };
}

/**
 * Ingest OSM data and build the base graph.
 *
 * This creates a graph with surface data derived only from OSM tags.
 * Use `enrichSurfaces` to add data from additional providers.
 *
 * @param options - OSM ingestion options
 * @returns The base graph and statistics
 */
export async function ingestOsm(
  options: OsmIngestionOptions
): Promise<IngestionResult> {
  const startTime = Date.now();

  // Parse OSM PBF and build graph
  const elements = parseOsmPbf(options.pbfPath, {
    activities: options.activities,
  });
  const { graph, stats: buildStats } = await buildGraphFromOsm(elements);

  // Compute surface statistics
  const surfaceStats = computeSurfaceStats(graph);

  const ingestionTimeMs = Date.now() - startTime;

  return {
    graph,
    stats: {
      nodesCount: buildStats.nodesCount,
      edgesCount: buildStats.edgesCount,
      totalLengthMeters: buildStats.totalLengthMeters,
      ingestionTimeMs,
      surface: surfaceStats,
    },
  };
}

/**
 * Compute surface statistics from a graph.
 */
function computeSurfaceStats(graph: Graph): SurfaceStats {
  let highConfidenceCount = 0;
  let mediumConfidenceCount = 0;
  let lowConfidenceCount = 0;
  let conflictCount = 0;
  const bySurfaceType: Record<SurfaceType, number> = {
    paved: 0,
    asphalt: 0,
    concrete: 0,
    gravel: 0,
    dirt: 0,
    unpaved: 0,
    unknown: 0,
  };

  for (const edge of graph.edges.values()) {
    const { surfaceClassification } = edge.attributes;
    const { surface, confidence, hasConflict } = surfaceClassification;

    // Count by confidence level
    if (confidence > 0.7) {
      highConfidenceCount++;
    } else if (confidence > 0.4) {
      mediumConfidenceCount++;
    } else {
      lowConfidenceCount++;
    }

    // Count conflicts
    if (hasConflict) {
      conflictCount++;
    }

    // Count by surface type
    bySurfaceType[surface] = (bySurfaceType[surface] ?? 0) + 1;
  }

  return {
    highConfidenceCount,
    mediumConfidenceCount,
    lowConfidenceCount,
    conflictCount,
    bySurfaceType,
  };
}

/**
 * Enrich graph edges with surface data from additional providers.
 *
 * This queries each provider and fuses their observations with
 * existing surface data to improve confidence scores.
 *
 * @param graph - The graph to enrich (modified in place)
 * @param providers - Surface data providers to query
 * @param bounds - Bounding box for the region
 * @returns Updated surface statistics
 */
export async function enrichSurfaces(
  _graph: Graph,
  _providers: SurfaceDataProvider[],
  _bounds: BoundingBox
): Promise<SurfaceStats> {
  // TODO: Implement surface enrichment
  // 1. For each provider, fetch observations for the region
  // 2. Match observations to graph edges
  // 3. Fuse observations using fuseSurfaceObservations
  // 4. Update edge surface classifications
  // 5. Return updated stats
  throw new Error("Not implemented: enrichSurfaces");
}

/**
 * Fuse multiple surface observations into a single classification.
 *
 * Uses a weighted voting scheme where:
 * - Explicit sources (OSM tag, Gravelmap) outweigh inferred sources
 * - Multiple agreeing sources increase confidence
 * - Conflicts are flagged for review
 *
 * @param observations - All observations for an edge
 * @returns Fused surface classification
 */
export function fuseSurfaceObservations(
  observations: SurfaceObservation[]
): SurfaceClassification {
  if (observations.length === 0) {
    return {
      surface: "unknown",
      confidence: 0,
      observations: [],
      hasConflict: false,
    };
  }

  // Source priority weights (higher = more trusted)
  const sourceWeights: Record<SurfaceDataSource, number> = {
    "gravelmap": 0.9, // Cycling-specific, crowd-sourced
    "user-report": 0.85, // Direct user feedback
    "osm-surface-tag": 0.7, // Explicit but may be stale
    "strava-heatmap": 0.5, // Indirect signal
    "satellite-ml": 0.4, // ML-based, variable quality
    "osm-highway-inferred": 0.2, // Inference only
  };

  // Group observations by surface type
  const votes = new Map<SurfaceType, number>();
  for (const obs of observations) {
    const weight = sourceWeights[obs.source] * obs.sourceConfidence;
    votes.set(obs.surface, (votes.get(obs.surface) ?? 0) + weight);
  }

  // Find winning surface type
  let maxVotes = 0;
  let winnerSurface: SurfaceType = "unknown";
  for (const [surface, voteWeight] of votes) {
    if (voteWeight > maxVotes) {
      maxVotes = voteWeight;
      winnerSurface = surface;
    }
  }

  // Check for conflicts (multiple surfaces with significant votes)
  const significantVotes = [...votes.entries()].filter(
    ([, v]) => v > maxVotes * 0.5
  );
  const hasConflict = significantVotes.length > 1;

  // Calculate confidence based on:
  // - Number of sources
  // - Agreement between sources
  // - Quality of sources
  const totalWeight = [...votes.values()].reduce((a, b) => a + b, 0);
  const agreement = maxVotes / totalWeight;
  const sourceCount = observations.length;
  const confidence = Math.min(
    0.95,
    agreement * 0.5 + Math.min(sourceCount / 3, 1) * 0.3 + (maxVotes / 2) * 0.2
  );

  return {
    surface: winnerSurface,
    confidence,
    observations,
    hasConflict,
  };
}

/**
 * Full ingestion pipeline: OSM + surface enrichment.
 *
 * @param options - Full ingestion options
 * @returns The enriched graph and statistics
 */
export async function ingest(options: IngestionOptions): Promise<IngestionResult> {
  // 1. Ingest base graph from OSM
  const result = await ingestOsm(options.osm);

  // 2. Enrich with additional surface providers
  if (options.surfaceProviders && options.surfaceProviders.length > 0) {
    const bounds = options.osm.bounds ?? inferBounds(result.graph);
    result.stats.surface = await enrichSurfaces(
      result.graph,
      options.surfaceProviders,
      bounds
    );
  }

  return result;
}

/**
 * Ingest routing data from the Overpass API for a bounding box.
 *
 * This is the Overpass equivalent of `ingestOsm()`. It queries the Overpass API
 * for routing-relevant ways and nodes, then builds a graph using the same
 * `buildGraphFromOsm()` pipeline used for PBF ingestion.
 *
 * @param bbox - Bounding box to query
 * @param options - Overpass API options (endpoint, timeout)
 * @returns The base graph and statistics
 */
export async function ingestFromOverpass(
  bbox: BoundingBox,
  options?: OverpassOptions
): Promise<IngestionResult> {
  const startTime = Date.now();

  // Fetch from Overpass API
  const response = await fetchOverpassData(bbox, options);

  // Parse response into OsmNode/OsmWay stream
  const elements = parseOverpassResponse(response);

  // Build graph using existing pipeline
  const { graph, stats: buildStats } = await buildGraphFromOsm(elements);

  // Compute surface statistics
  const surfaceStats = computeSurfaceStats(graph);

  const ingestionTimeMs = Date.now() - startTime;

  return {
    graph,
    stats: {
      nodesCount: buildStats.nodesCount,
      edgesCount: buildStats.edgesCount,
      totalLengthMeters: buildStats.totalLengthMeters,
      ingestionTimeMs,
      surface: surfaceStats,
    },
  };
}

/**
 * Infer bounding box from graph nodes.
 */
function inferBounds(graph: Graph): BoundingBox {
  let minLat = Infinity,
    maxLat = -Infinity;
  let minLng = Infinity,
    maxLng = -Infinity;

  for (const node of graph.nodes.values()) {
    minLat = Math.min(minLat, node.coordinate.lat);
    maxLat = Math.max(maxLat, node.coordinate.lat);
    minLng = Math.min(minLng, node.coordinate.lng);
    maxLng = Math.max(maxLng, node.coordinate.lng);
  }

  return { minLat, maxLat, minLng, maxLng };
}
