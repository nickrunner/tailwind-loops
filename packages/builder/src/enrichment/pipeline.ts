/**
 * Enrichment pipeline orchestrator.
 *
 * Coordinates providers, spatial matching, and fusion to enrich
 * graph edges with multi-source attribute data.
 */

import type {
  BoundingBox,
  EnrichableAttribute,
  Graph,
  Observation,
  AttributeEnrichment,
  PointDetection,
} from "@tailwind-loops/types";
import type { EnrichmentProvider } from "./provider.js";
import { EdgeSpatialIndex } from "./spatial-index.js";
import {
  createDefaultStrategies,
  type AnyFusionStrategy,
} from "./fusion.js";

// ---------------------------------------------------------------------------
// Options & stats
// ---------------------------------------------------------------------------

export interface EnrichmentOptions {
  /** Bounding box for the region to enrich */
  bounds: BoundingBox;
  /** Providers to query for observations */
  providers: EnrichmentProvider[];
  /** Override default fusion strategies */
  strategies?: Map<EnrichableAttribute, AnyFusionStrategy>;
  /** Max distance (meters) for spatial matching */
  maxMatchDistance?: number;
}

/** Per-provider timing */
export interface ProviderStats {
  providerName: string;
  source: string;
  fetchTimeMs: number;
  observationCount: number;
  matchedEdgeCount: number;
}

/** Per-attribute enrichment counts */
export interface AttributeStats {
  attribute: EnrichableAttribute;
  enrichedEdgeCount: number;
  conflictCount: number;
}

export interface EnrichmentStats {
  providers: ProviderStats[];
  attributes: AttributeStats[];
  totalTimeMs: number;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Enrich graph edges with data from multiple providers.
 *
 * 1. Build spatial index from graph edges
 * 2. Fetch observations from each provider
 * 3. Spatial-match observations to edges
 * 4. Merge with existing enrichment observations (incremental support)
 * 5. Fuse per-attribute per-edge
 * 6. Write resolved values + enrichment metadata to edges
 *
 * Mutates the graph in place.
 */
export async function enrichGraph(
  graph: Graph,
  options: EnrichmentOptions
): Promise<EnrichmentStats> {
  const startTime = Date.now();
  const strategies = options.strategies ?? createDefaultStrategies();
  const maxDist = options.maxMatchDistance ?? 50;

  // 1. Build spatial index
  const spatialIndex = new EdgeSpatialIndex(graph);

  // 2-3. Fetch and match observations per provider
  const providerStats: ProviderStats[] = [];

  // Accumulate all observations per edge
  const edgeObservations = new Map<string, Observation[]>();

  // Pre-populate with existing enrichment observations (incremental)
  for (const edge of graph.edges.values()) {
    if (edge.attributes.enrichment) {
      const existing: Observation[] = [];
      for (const enrichment of Object.values(edge.attributes.enrichment)) {
        if (enrichment?.observations) {
          existing.push(...enrichment.observations);
        }
      }
      if (existing.length > 0) {
        edgeObservations.set(edge.id, existing);
      }
    }
  }

  for (const provider of options.providers) {
    const fetchStart = Date.now();
    let observations: Observation[];
    try {
      observations = await provider.fetchObservations(options.bounds);
    } catch {
      // Skip failed providers gracefully
      providerStats.push({
        providerName: provider.name,
        source: provider.source,
        fetchTimeMs: Date.now() - fetchStart,
        observationCount: 0,
        matchedEdgeCount: 0,
      });
      continue;
    }
    const fetchTimeMs = Date.now() - fetchStart;

    // Spatial match
    const matched = spatialIndex.matchToEdges(observations, maxDist);

    // Merge into accumulator
    for (const [edgeId, obs] of matched) {
      let list = edgeObservations.get(edgeId);
      if (!list) {
        list = [];
        edgeObservations.set(edgeId, list);
      }
      list.push(...obs);
    }

    providerStats.push({
      providerName: provider.name,
      source: provider.source,
      fetchTimeMs,
      observationCount: observations.length,
      matchedEdgeCount: matched.size,
    });
  }

  // 4-7. Group by attribute, fuse, write to edges
  const attributeCounts = new Map<
    EnrichableAttribute,
    { enriched: number; conflicts: number }
  >();

  for (const [edgeId, observations] of edgeObservations) {
    const edge = graph.edges.get(edgeId);
    if (!edge) continue;

    // Group observations by attribute
    const byAttribute = new Map<EnrichableAttribute, Observation[]>();
    for (const obs of observations) {
      let list = byAttribute.get(obs.attribute);
      if (!list) {
        list = [];
        byAttribute.set(obs.attribute, list);
      }
      list.push(obs);
    }

    // Initialize enrichment bag
    if (!edge.attributes.enrichment) {
      edge.attributes.enrichment = {};
    }

    for (const [attr, attrObs] of byAttribute) {
      const strategy = strategies.get(attr);
      if (!strategy) continue;

      // Fuse observations
      const result = strategy.fuse(attrObs as Observation<typeof attr>[]);

      // Write enrichment metadata
      const enrichment: AttributeEnrichment = {
        confidence: result.confidence,
        hasConflict: result.hasConflict,
        observations: attrObs,
      };
      edge.attributes.enrichment[attr] = enrichment;

      // Write resolved value to the existing edge field
      applyResolvedValue(edge.attributes, attr, result.value);

      // Track stats
      let counts = attributeCounts.get(attr);
      if (!counts) {
        counts = { enriched: 0, conflicts: 0 };
        attributeCounts.set(attr, counts);
      }
      counts.enriched++;
      if (result.hasConflict) counts.conflicts++;
    }
  }

  const attributeStats: AttributeStats[] = [];
  for (const [attr, counts] of attributeCounts) {
    attributeStats.push({
      attribute: attr,
      enrichedEdgeCount: counts.enriched,
      conflictCount: counts.conflicts,
    });
  }

  return {
    providers: providerStats,
    attributes: attributeStats,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Apply a fused value back to the existing edge attribute fields.
 * This keeps backward compatibility — existing code reading edge.attributes.speedLimit
 * still works.
 */
function applyResolvedValue(
  attrs: import("@tailwind-loops/types").EdgeAttributes,
  attribute: EnrichableAttribute,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
): void {
  switch (attribute) {
    case "surface":
      // Update surfaceClassification for backward compat
      if (attrs.enrichment?.surface) {
        attrs.surfaceClassification = {
          surface: value,
          confidence: attrs.enrichment.surface.confidence,
          hasConflict: attrs.enrichment.surface.hasConflict,
        };
      }
      break;

    case "speed-limit":
      if (typeof value === "number" && value > 0) {
        attrs.speedLimit = value;
      }
      break;

    case "stop-sign": {
      const detection = value as PointDetection;
      if (detection.detectionConfidence > 0) {
        attrs.stopSignCount = (attrs.stopSignCount ?? 0) + 1;
      }
      break;
    }

    case "traffic-signal": {
      const detection = value as PointDetection;
      if (detection.detectionConfidence > 0) {
        attrs.trafficSignalCount = (attrs.trafficSignalCount ?? 0) + 1;
      }
      break;
    }

    case "road-crossing": {
      const detection = value as PointDetection;
      if (detection.detectionConfidence > 0) {
        attrs.roadCrossingCount = (attrs.roadCrossingCount ?? 0) + 1;
      }
      break;
    }

    case "bicycle-infra":
      if (typeof value === "boolean") {
        attrs.infrastructure.hasBicycleInfra = value;
      }
      break;

    case "traffic-calming":
      if (typeof value === "boolean") {
        attrs.infrastructure.hasTrafficCalming = value;
      }
      break;

    case "scenic":
      if (typeof value === "number") {
        attrs.scenicDesignation = value > 0.5;
      }
      break;
  }
}
