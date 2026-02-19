/**
 * Coordinate snapping and distance utilities for route search.
 */

import type { Coordinate } from "@tailwind-loops/types";
import type { SearchGraph } from "./search-graph.js";

/** Result of snapping a coordinate to the nearest search graph node */
export interface SnapResult {
  nodeId: string;
  snapDistance: number;
  coordinate: Coordinate;
}

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Haversine distance between two coordinates in meters.
 */
export function haversineDistance(a: Coordinate, b: Coordinate): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinHalfLng * sinHalfLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Compute the compass bearing from point a to point b in degrees (0=N, 90=E).
 */
export function bearing(a: Coordinate, b: Coordinate): number {
  const toRad = Math.PI / 180;
  const dLng = (b.lng - a.lng) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Minimum outgoing edges for a node to be considered well-connected */
const MIN_CONNECTIVITY = 3;

/**
 * Snap a coordinate to the nearest well-connected node in the search graph.
 *
 * Instead of just picking the closest node (which may be a dead-end residential
 * street), this finds nearby candidates and prefers nodes with more outgoing
 * edges. It collects the closest N nodes within a search radius and picks the
 * one with the best connectivity.
 *
 * @param maxDistance - Maximum snap distance in meters (default 5000)
 */
export function snapToNode(
  coord: Coordinate,
  searchGraph: SearchGraph,
  maxDistance = 5000,
): SnapResult | null {
  // Collect the closest candidates (keep top N by distance)
  const candidateLimit = 50;
  const candidates: { nodeId: string; dist: number; coord: Coordinate; edgeCount: number }[] = [];

  for (const [nodeId, nodeCoord] of searchGraph.nodeCoordinates) {
    const dist = haversineDistance(coord, nodeCoord);
    if (dist > maxDistance) continue;

    const edgeCount = searchGraph.adjacency.get(nodeId)?.length ?? 0;
    candidates.push({ nodeId, dist, coord: nodeCoord, edgeCount });
  }

  if (candidates.length === 0) return null;

  // Sort by distance
  candidates.sort((a, b) => a.dist - b.dist);
  const nearby = candidates.slice(0, candidateLimit);

  // First, try to find a well-connected node within reasonable distance.
  // "Reasonable" = within 3x the closest node's distance (or 500m, whichever is larger)
  const closestDist = nearby[0]!.dist;
  const searchRadius = Math.max(closestDist * 3, 500);

  let best: (typeof nearby)[0] | null = null;
  for (const c of nearby) {
    if (c.dist > searchRadius) break;
    if (c.edgeCount >= MIN_CONNECTIVITY) {
      if (!best || c.edgeCount > best.edgeCount || (c.edgeCount === best.edgeCount && c.dist < best.dist)) {
        best = c;
      }
    }
  }

  // Fall back to the closest node if no well-connected node found
  if (!best) {
    best = nearby[0]!;
  }

  console.log(`[snap] Closest node: ${nearby[0]!.nodeId} (${nearby[0]!.dist.toFixed(0)}m, ${nearby[0]!.edgeCount} edges). Selected: ${best.nodeId} (${best.dist.toFixed(0)}m, ${best.edgeCount} edges)`);

  return { nodeId: best.nodeId, snapDistance: best.dist, coordinate: best.coord };
}
