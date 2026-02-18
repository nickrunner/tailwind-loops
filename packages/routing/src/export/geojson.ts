/**
 * GeoJSON export for Graph data.
 *
 * Exports graph edges as GeoJSON FeatureCollection of LineStrings,
 * with edge attributes as feature properties. Useful for visualization
 * in QGIS, geojson.io, Mapbox, etc.
 */

import type { Graph, GraphEdge, Coordinate } from "@tailwind-loops/types";

/** GeoJSON types (subset we need) */
interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

interface GeoJsonFeature {
  type: "Feature";
  geometry: GeoJsonLineString | GeoJsonPoint;
  properties: Record<string, unknown>;
}

interface GeoJsonLineString {
  type: "LineString";
  coordinates: [number, number][];
}

interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

/** Options for GeoJSON export */
export interface GeoJsonExportOptions {
  /** Include only edges matching these road classes */
  roadClasses?: string[];
  /** Include only edges matching these surface types */
  surfaceTypes?: string[];
  /** Minimum surface confidence to include */
  minConfidence?: number;
  /** Include node points in addition to edges */
  includeNodes?: boolean;
  /** Include only forward edges (skip reverse duplicates for bidirectional) */
  deduplicateBidirectional?: boolean;
}

/**
 * Export a Graph to a GeoJSON FeatureCollection.
 *
 * Each edge becomes a LineString feature with properties:
 * - id, osmWayId, name
 * - roadClass, surface, surfaceConfidence
 * - lengthMeters, oneWay, lanes, speedLimit
 * - hasDedicatedPath, isSeparated
 *
 * @param graph - The graph to export
 * @param options - Export options for filtering
 * @returns GeoJSON FeatureCollection
 */
export function graphToGeoJson(
  graph: Graph,
  options: GeoJsonExportOptions = {}
): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];
  const seen = new Set<string>();

  for (const edge of graph.edges.values()) {
    // Deduplication: for bidirectional edges, skip reverse
    if (options.deduplicateBidirectional) {
      const canonicalKey = [edge.fromNodeId, edge.toNodeId].sort().join("-") +
        ":" + (edge.osmWayId ?? edge.id);
      if (seen.has(canonicalKey)) continue;
      seen.add(canonicalKey);
    }

    // Filter by road class
    if (
      options.roadClasses &&
      !options.roadClasses.includes(edge.attributes.roadClass)
    ) {
      continue;
    }

    // Filter by surface type
    if (
      options.surfaceTypes &&
      !options.surfaceTypes.includes(edge.attributes.surfaceClassification.surface)
    ) {
      continue;
    }

    // Filter by confidence
    if (
      options.minConfidence !== undefined &&
      edge.attributes.surfaceClassification.confidence < options.minConfidence
    ) {
      continue;
    }

    features.push(edgeToFeature(edge));
  }

  // Optionally include nodes
  if (options.includeNodes) {
    for (const node of graph.nodes.values()) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [node.coordinate.lng, node.coordinate.lat],
        },
        properties: {
          id: node.id,
          osmId: node.osmId ?? null,
          featureType: "node",
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

/**
 * Convert a single edge to a GeoJSON Feature.
 */
function edgeToFeature(edge: GraphEdge): GeoJsonFeature {
  const { attributes } = edge;

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: edge.geometry.map(coordToGeoJson),
    },
    properties: {
      id: edge.id,
      osmWayId: edge.osmWayId ?? null,
      name: attributes.name ?? null,
      roadClass: attributes.roadClass,
      surface: attributes.surfaceClassification.surface,
      surfaceConfidence: Math.round(attributes.surfaceClassification.confidence * 100) / 100,
      hasConflict: attributes.surfaceClassification.hasConflict,
      lengthMeters: Math.round(attributes.lengthMeters),
      oneWay: attributes.oneWay,
      lanes: attributes.lanes ?? null,
      speedLimit: attributes.speedLimit ?? null,
      hasBicycleInfra: attributes.infrastructure.hasBicycleInfra,
      hasPedestrianPath: attributes.infrastructure.hasPedestrianPath,
      hasShoulder: attributes.infrastructure.hasShoulder,
      isSeparated: attributes.infrastructure.isSeparated,
      hasTrafficCalming: attributes.infrastructure.hasTrafficCalming,
      featureType: "edge",
    },
  };
}

/**
 * Convert our Coordinate to GeoJSON [lng, lat] format.
 */
function coordToGeoJson(coord: Coordinate): [number, number] {
  return [coord.lng, coord.lat];
}
