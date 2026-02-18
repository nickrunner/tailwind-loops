/**
 * Corridor attribute aggregation, naming, and geometry construction.
 *
 * Converts raw edge chains into rich corridor data: aggregated attributes,
 * derived names, and simplified geometry.
 */

import type {
  Coordinate,
  Graph,
  RoadClass,
  SurfaceType,
  CorridorConfidence,
} from "@tailwind-loops/types";

import type { CorridorAttributes } from "@tailwind-loops/types";

/**
 * Aggregate corridor attributes from a set of edges.
 *
 * Computes length-weighted predominant values for road class, surface,
 * and various continuity metrics.
 */
export function aggregateAttributes(
  edgeIds: string[],
  graph: Graph
): CorridorAttributes {
  let totalLength = 0;
  const roadClassLengths = new Map<RoadClass, number>();
  const surfaceLengths = new Map<SurfaceType, number>();
  let weightedConfidence = 0;
  let bicycleInfraLength = 0;
  let pedestrianPathLength = 0;
  let separatedLength = 0;
  let weightedSpeedLimit = 0;
  let speedLimitLength = 0;
  let turnsCount = 0;
  let totalStopControls = 0;
  let scenicLength = 0;
  let trafficCalmingLength = 0;
  const seenNodes = new Set<string>();
  let intersectionCount = 0;

  for (let i = 0; i < edgeIds.length; i++) {
    const edge = graph.edges.get(edgeIds[i]!)!;
    const len = edge.attributes.lengthMeters;
    totalLength += len;

    // Road class accumulation
    const rc = edge.attributes.roadClass;
    roadClassLengths.set(rc, (roadClassLengths.get(rc) ?? 0) + len);

    // Surface accumulation
    const surf = edge.attributes.surfaceClassification.surface;
    surfaceLengths.set(surf, (surfaceLengths.get(surf) ?? 0) + len);

    // Weighted confidence
    weightedConfidence += edge.attributes.surfaceClassification.confidence * len;

    // Infrastructure continuity (bicycle vs pedestrian)
    if (edge.attributes.infrastructure.hasBicycleInfra) {
      bicycleInfraLength += len;
    }
    if (edge.attributes.infrastructure.hasPedestrianPath) {
      pedestrianPathLength += len;
    }
    if (edge.attributes.infrastructure.isSeparated) {
      separatedLength += len;
    }

    // Traffic calming
    if (edge.attributes.infrastructure.hasTrafficCalming) {
      trafficCalmingLength += len;
    }

    // Scenic designation
    if (edge.attributes.scenicDesignation) {
      scenicLength += len;
    }

    // Speed limit
    if (edge.attributes.speedLimit != null) {
      weightedSpeedLimit += edge.attributes.speedLimit * len;
      speedLimitLength += len;
    }

    // Count all stop controls: stop signs, traffic signals, and road crossings
    // Edge-level counts cover intermediate nodes; endpoint crossing nodes are
    // counted via GraphNode.isCrossing (deduplicated across shared junctions)
    totalStopControls += (edge.attributes.stopSignCount ?? 0)
      + (edge.attributes.trafficSignalCount ?? 0)
      + (edge.attributes.roadCrossingCount ?? 0);

    // Count intersection nodes (graph nodes with >2 outgoing edges)
    // This is topology-based, always reliable regardless of OSM tagging
    for (const nodeId of [edge.fromNodeId, edge.toNodeId]) {
      if (seenNodes.has(nodeId)) continue;
      seenNodes.add(nodeId);
      const outDegree = graph.adjacency.get(nodeId)?.length ?? 0;
      if (outDegree > 2) {
        intersectionCount++;
      }
    }

    // Turns: angle changes > 30 degrees between consecutive edges
    if (i > 0) {
      const prevEdge = graph.edges.get(edgeIds[i - 1]!)!;
      const angle = angleBetweenEdges(prevEdge.geometry, edge.geometry);
      if (angle > 30) {
        turnsCount++;
      }
    }
  }

  // Aggregate enrichment confidence per dimension
  const confidence = aggregateConfidence(edgeIds, graph, totalLength);

  return {
    lengthMeters: totalLength,
    predominantRoadClass: maxByLength(roadClassLengths)!,
    predominantSurface: maxByLength(surfaceLengths)!,
    surfaceConfidence: totalLength > 0 ? weightedConfidence / totalLength : 0,
    bicycleInfraContinuity: totalLength > 0 ? bicycleInfraLength / totalLength : 0,
    pedestrianPathContinuity: totalLength > 0 ? pedestrianPathLength / totalLength : 0,
    separationContinuity: totalLength > 0 ? separatedLength / totalLength : 0,
    averageSpeedLimit:
      speedLimitLength > 0
        ? weightedSpeedLimit / speedLimitLength
        : undefined,
    stopDensityPerKm: totalLength > 0 ? (totalStopControls / (totalLength / 1000)) : 0,
    crossingDensityPerKm: totalLength > 0 ? (intersectionCount / (totalLength / 1000)) : 0,
    turnsCount,
    trafficCalmingContinuity: totalLength > 0 ? trafficCalmingLength / totalLength : 0,
    scenicScore: totalLength > 0 ? scenicLength / totalLength : 0,
    confidence,
  };
}

/**
 * Aggregate per-edge enrichment confidence into corridor-level confidence.
 * Returns undefined if no edges have enrichment data.
 */
function aggregateConfidence(
  edgeIds: string[],
  graph: Graph,
  totalLength: number
): CorridorConfidence | undefined {
  if (totalLength === 0) return undefined;

  let hasSomeEnrichment = false;
  let surfaceConfSum = 0;
  let surfaceWeightSum = 0;
  let speedConfSum = 0;
  let speedWeightSum = 0;
  let trafficConfSum = 0;
  let trafficWeightSum = 0;
  let infraConfSum = 0;
  let infraWeightSum = 0;
  let scenicConfSum = 0;
  let scenicWeightSum = 0;

  for (const edgeId of edgeIds) {
    const edge = graph.edges.get(edgeId)!;
    const len = edge.attributes.lengthMeters;
    const enrichment = edge.attributes.enrichment;
    if (!enrichment) continue;

    hasSomeEnrichment = true;

    if (enrichment.surface) {
      surfaceConfSum += enrichment.surface.confidence * len;
      surfaceWeightSum += len;
    }
    if (enrichment["speed-limit"]) {
      speedConfSum += enrichment["speed-limit"].confidence * len;
      speedWeightSum += len;
    }

    // Traffic control: average across stop-sign, traffic-signal, road-crossing
    const tcAttrs = [
      enrichment["stop-sign"],
      enrichment["traffic-signal"],
      enrichment["road-crossing"],
    ].filter(Boolean);
    if (tcAttrs.length > 0) {
      const avgTcConf = tcAttrs.reduce((s, a) => s + a!.confidence, 0) / tcAttrs.length;
      trafficConfSum += avgTcConf * len;
      trafficWeightSum += len;
    }

    if (enrichment["bicycle-infra"]) {
      infraConfSum += enrichment["bicycle-infra"].confidence * len;
      infraWeightSum += len;
    }
    if (enrichment.scenic) {
      scenicConfSum += enrichment.scenic.confidence * len;
      scenicWeightSum += len;
    }
  }

  if (!hasSomeEnrichment) return undefined;

  return {
    surface: surfaceWeightSum > 0 ? surfaceConfSum / surfaceWeightSum : 0,
    speedLimit: speedWeightSum > 0 ? speedConfSum / speedWeightSum : 0,
    trafficControl: trafficWeightSum > 0 ? trafficConfSum / trafficWeightSum : 0,
    infrastructure: infraWeightSum > 0 ? infraConfSum / infraWeightSum : 0,
    scenic: scenicWeightSum > 0 ? scenicConfSum / scenicWeightSum : 0,
  };
}

/**
 * Derive a human-readable name for the corridor from its edges.
 *
 * Picks the most common name weighted by edge length.
 * Returns undefined if all edges are unnamed.
 */
export function deriveName(
  edgeIds: string[],
  graph: Graph
): string | undefined {
  const nameLengths = new Map<string, number>();

  for (const edgeId of edgeIds) {
    const edge = graph.edges.get(edgeId)!;
    const name = edge.attributes.name;
    if (name) {
      nameLengths.set(name, (nameLengths.get(name) ?? 0) + edge.attributes.lengthMeters);
    }
  }

  if (nameLengths.size === 0) return undefined;
  return maxByLength(nameLengths)!;
}

/**
 * Build simplified corridor geometry from edge geometries.
 *
 * Concatenates edge geometries, removes duplicate junction points,
 * and applies Douglas-Peucker simplification.
 */
export function buildCorridorGeometry(
  edgeIds: string[],
  graph: Graph,
  toleranceMeters: number = 10
): Coordinate[] {
  if (edgeIds.length === 0) return [];

  // Concatenate edge geometries, removing duplicate junction points
  const coords: Coordinate[] = [];
  for (let i = 0; i < edgeIds.length; i++) {
    const edge = graph.edges.get(edgeIds[i]!)!;
    const geom = edge.geometry;

    if (i === 0) {
      // Add all points from first edge
      coords.push(...geom);
    } else {
      // Skip first point if it duplicates the last added point (junction)
      const start = geom.length > 0 && coords.length > 0 &&
        coordsEqual(geom[0]!, coords[coords.length - 1]!)
        ? 1
        : 0;
      for (let j = start; j < geom.length; j++) {
        coords.push(geom[j]!);
      }
    }
  }

  if (coords.length <= 2) return coords;

  return douglasPeucker(coords, toleranceMeters);
}

/**
 * Douglas-Peucker line simplification algorithm.
 *
 * Recursively removes points that are within the tolerance distance
 * of the line between the start and end points.
 */
export function douglasPeucker(
  points: Coordinate[],
  toleranceMeters: number
): Coordinate[] {
  if (points.length <= 2) return [...points];

  // Find point with maximum perpendicular distance
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0]!;
  const end = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i]!, start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > toleranceMeters) {
    // Recursively simplify each segment
    const left = douglasPeucker(points.slice(0, maxIdx + 1), toleranceMeters);
    const right = douglasPeucker(points.slice(maxIdx), toleranceMeters);
    // Combine, removing duplicate middle point
    return [...left.slice(0, -1), ...right];
  }

  // All points within tolerance - keep only endpoints
  return [start, end];
}

/**
 * Perpendicular distance from a point to a line segment (in meters).
 * Uses a flat-earth approximation suitable for short distances.
 */
function perpendicularDistance(
  point: Coordinate,
  lineStart: Coordinate,
  lineEnd: Coordinate
): number {
  // Convert to approximate meters using mid-latitude
  const midLat = ((lineStart.lat + lineEnd.lat) / 2) * Math.PI / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(midLat);

  const px = (point.lng - lineStart.lng) * metersPerDegLng;
  const py = (point.lat - lineStart.lat) * metersPerDegLat;
  const lx = (lineEnd.lng - lineStart.lng) * metersPerDegLng;
  const ly = (lineEnd.lat - lineStart.lat) * metersPerDegLat;

  const lineLenSq = lx * lx + ly * ly;
  if (lineLenSq === 0) {
    // Start and end are the same point
    return Math.sqrt(px * px + py * py);
  }

  // Project point onto line, clamped to segment
  const t = Math.max(0, Math.min(1, (px * lx + py * ly) / lineLenSq));
  const projX = t * lx;
  const projY = t * ly;

  const dx = px - projX;
  const dy = py - projY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the angle change between two consecutive edges at their junction.
 */
function angleBetweenEdges(
  prevGeom: Coordinate[],
  nextGeom: Coordinate[]
): number {
  if (prevGeom.length < 2 || nextGeom.length < 2) return 0;

  const exitB = bearing(
    prevGeom[prevGeom.length - 2]!,
    prevGeom[prevGeom.length - 1]!
  );
  const entryB = bearing(nextGeom[0]!, nextGeom[1]!);

  let diff = Math.abs(exitB - entryB) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Compute bearing from point a to point b in degrees (0-360).
 */
function bearing(a: Coordinate, b: Coordinate): number {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/** Check if two coordinates are the same point. */
function coordsEqual(a: Coordinate, b: Coordinate): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

/**
 * Compute the fraction of total chain length covered by the most common name.
 *
 * Returns 0 if all edges are unnamed, otherwise a value in (0, 1]
 * where 1.0 means every edge shares the same name.
 *
 * This is a lightweight version of `deriveName()` that returns coverage
 * fraction rather than the name itself. Used by chain classification
 * to give a name-continuity bonus.
 */
export function nameConsistency(
  edgeIds: string[],
  graph: Graph
): number {
  let totalLength = 0;
  const nameLengths = new Map<string, number>();

  for (const edgeId of edgeIds) {
    const edge = graph.edges.get(edgeId)!;
    const len = edge.attributes.lengthMeters;
    totalLength += len;
    const name = edge.attributes.name;
    if (name) {
      nameLengths.set(name, (nameLengths.get(name) ?? 0) + len);
    }
  }

  if (totalLength === 0 || nameLengths.size === 0) return 0;

  let bestLen = 0;
  for (const len of nameLengths.values()) {
    if (len > bestLen) bestLen = len;
  }

  return bestLen / totalLength;
}

/** Find the key with the greatest accumulated length. */
function maxByLength<T>(map: Map<T, number>): T | undefined {
  let best: T | undefined;
  let bestLen = -1;
  for (const [key, len] of map) {
    if (len > bestLen) {
      bestLen = len;
      best = key;
    }
  }
  return best;
}
