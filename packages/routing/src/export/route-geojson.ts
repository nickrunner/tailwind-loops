/**
 * GeoJSON export for Route data.
 *
 * Converts Route objects into GeoJSON FeatureCollections with per-segment
 * LineString features. Handles edge traversal direction so geometry renders
 * correctly regardless of which direction edges were traversed.
 */

import type { Graph, GraphEdge, Route } from "@tailwind-loops/types";

/** A single GeoJSON feature for a route segment or summary. */
export interface RouteGeoJsonFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: Record<string, unknown>;
}

/** GeoJSON FeatureCollection for a set of routes. */
export interface RouteGeoJsonCollection {
  type: "FeatureCollection";
  features: RouteGeoJsonFeature[];
}

/**
 * Build coordinate array from a chain of graph edges, respecting traversal direction.
 *
 * Determines the entry node of the first edge by finding the shared node with
 * the second edge, then walks the chain tracking the current node.
 */
export function buildDirectedCoords(edges: GraphEdge[]): [number, number][] {
  const coords: [number, number][] = [];
  if (edges.length === 0) return coords;

  // Determine entry node for the first edge
  let currentNode: string;
  if (edges.length === 1) {
    currentNode = edges[0]!.fromNodeId;
  } else {
    const first = edges[0]!;
    const second = edges[1]!;
    // The shared node is the exit of the first edge
    if (first.toNodeId === second.fromNodeId || first.toNodeId === second.toNodeId) {
      currentNode = first.fromNodeId; // forward: enter at from, exit at to
    } else {
      currentNode = first.toNodeId; // reversed: enter at to, exit at from
    }
  }

  for (const edge of edges) {
    const reversed = currentNode !== edge.fromNodeId;
    const geom = reversed ? [...edge.geometry].reverse() : edge.geometry;

    for (const c of geom) {
      const pt: [number, number] = [c.lng, c.lat];
      if (coords.length > 0) {
        const last = coords[coords.length - 1]!;
        if (
          Math.abs(last[0] - pt[0]) < 1e-8 &&
          Math.abs(last[1] - pt[1]) < 1e-8
        )
          continue;
      }
      coords.push(pt);
    }

    currentNode = reversed ? edge.fromNodeId : edge.toNodeId;
  }

  return coords;
}

/**
 * Build per-segment GeoJSON features for a single route.
 *
 * Each route segment (corridor or connector) becomes a LineString feature
 * with properties for styling and identification. A summary feature with
 * route-level stats is also included (invisible, for popup info).
 */
export function routeToSegmentFeatures(
  route: Route,
  routeIndex: number,
  graph: Graph,
): RouteGeoJsonFeature[] {
  const isPrimary = routeIndex === 0;
  const baseColor = isPrimary ? "#2563eb" : "#9333ea";
  const unpavedColor = isPrimary ? "#d97706" : "#b45309";
  const features: RouteGeoJsonFeature[] = [];

  for (const seg of route.segments) {
    let surface = "unknown";
    let edges: GraphEdge[];

    if (seg.kind === "corridor") {
      surface = seg.corridor.attributes.predominantSurface;
      edges = seg.traversedEdgeIds
        .map((id) => graph.edges.get(id))
        .filter((e): e is GraphEdge => e != null);
    } else {
      edges = seg.edges;
    }

    const coords = buildDirectedCoords(edges);

    if (coords.length < 2) continue;

    const color = surface === "unpaved" ? unpavedColor : baseColor;

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {
        routeIndex,
        isPrimary,
        isSegment: true,
        surface,
        corridorName:
          seg.kind === "corridor" ? (seg.corridor.name ?? null) : null,
        corridorType:
          seg.kind === "corridor" ? seg.corridor.type : "connector",
        stroke: color,
        "stroke-width": isPrimary ? 4 : 3,
        "stroke-opacity": isPrimary ? 0.9 : 0.6,
      },
    });
  }

  // Route-level summary feature (invisible, for popup metadata)
  features.push({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: route.geometry.map(
        (c) => [c.lng, c.lat] as [number, number],
      ),
    },
    properties: {
      routeIndex,
      isPrimary,
      isSegment: false,
      score: Math.round(route.score * 1000) / 1000,
      distanceMeters: Math.round(route.stats.totalDistanceMeters),
      distanceKm:
        Math.round(route.stats.totalDistanceMeters / 100) / 10,
      totalStops: route.stats.totalStops,
      flowScore: route.stats.flowScore,
      segmentCount: route.segments.length,
      elevationGain: route.stats.elevationGainMeters ?? null,
      elevationLoss: route.stats.elevationLossMeters ?? null,
      surfacePaved: route.stats.distanceBySurface?.["paved"] ?? 0,
      surfaceUnpaved: route.stats.distanceBySurface?.["unpaved"] ?? 0,
      surfaceUnknown: route.stats.distanceBySurface?.["unknown"] ?? 0,
      stroke: "#000000",
      "stroke-width": 0,
      "stroke-opacity": 0,
    },
  });

  return features;
}
