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
} from "../domain/graph.js";

import type { CorridorAttributes } from "../domain/corridor.js";

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
  let dedicatedPathLength = 0;
  let separatedLength = 0;
  let weightedSpeedLimit = 0;
  let speedLimitLength = 0;
  let turnsCount = 0;

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

    // Infrastructure continuity
    if (edge.attributes.infrastructure.hasDedicatedPath) {
      dedicatedPathLength += len;
    }
    if (edge.attributes.infrastructure.isSeparated) {
      separatedLength += len;
    }

    // Speed limit
    if (edge.attributes.speedLimit != null) {
      weightedSpeedLimit += edge.attributes.speedLimit * len;
      speedLimitLength += len;
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

  return {
    lengthMeters: totalLength,
    predominantRoadClass: maxByLength(roadClassLengths)!,
    predominantSurface: maxByLength(surfaceLengths)!,
    surfaceConfidence: totalLength > 0 ? weightedConfidence / totalLength : 0,
    infrastructureContinuity: totalLength > 0 ? dedicatedPathLength / totalLength : 0,
    separationContinuity: totalLength > 0 ? separatedLength / totalLength : 0,
    averageSpeedLimit:
      speedLimitLength > 0
        ? weightedSpeedLimit / speedLimitLength
        : undefined,
    stopDensityPerKm: 0,
    turnsCount,
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
