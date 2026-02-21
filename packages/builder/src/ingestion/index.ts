/**
 * Data ingestion module.
 *
 * Responsible for building the graph from OSM data.
 *
 * Pipeline:
 * OSM PBF / Overpass API -> Graph -> Enrichment Pipeline -> Enriched Graph
 */

import type {
  Graph,
  SurfaceType,
  BoundingBox,
} from "@tailwind-loops/types";
import { parseOsmPbf, buildGraphFromOsm } from "./osm/index.js";
import { fetchOverpassData, parseOverpassResponse } from "./overpass/index.js";
import type { OverpassOptions } from "./overpass/index.js";

// Re-export BoundingBox from types for backward compatibility
export type { BoundingBox } from "@tailwind-loops/types";

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
  /** Enrichment providers for multi-source data fusion */
  enrichmentProviders?: import("../enrichment/provider.js").EnrichmentProvider[];
  /** Elevation enrichment from DEM tiles */
  elevation?: { dem: import("../elevation/hgt-reader.js").DemConfig };
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
 * Use the enrichment pipeline to add data from additional providers.
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
 * Full ingestion pipeline: OSM + enrichment.
 *
 * @param options - Full ingestion options
 * @returns The enriched graph and statistics
 */
export async function ingest(options: IngestionOptions): Promise<IngestionResult> {
  // 1. Ingest base graph from OSM
  const result = await ingestOsm(options.osm);

  // 2. Enrich with elevation data from DEM
  if (options.elevation) {
    const { enrichElevation } = await import("../elevation/index.js");
    enrichElevation(result.graph, options.elevation);
  }

  // 3. Enrich with enrichment providers
  if (options.enrichmentProviders && options.enrichmentProviders.length > 0) {
    const { enrichGraph } = await import("../enrichment/pipeline.js");

    const bounds = options.osm.bounds ?? inferBounds(result.graph);
    await enrichGraph(result.graph, {
      bounds,
      providers: options.enrichmentProviders,
    });

    // Recompute surface stats after enrichment
    result.stats.surface = computeSurfaceStats(result.graph);
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
  const { data } = await fetchOverpassData(bbox, options);

  // Parse response into OsmNode/OsmWay stream
  const elements = parseOverpassResponse(data);

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
