/**
 * Graph traversal and chain building for corridor clustering.
 *
 * Walks the graph from each unvisited edge, extending chains of compatible
 * edges in both directions. Produces raw corridor chains (ordered lists of
 * edge IDs) before attribute aggregation.
 */

import type { Coordinate, Graph, GraphEdge } from "../domain/graph.js";
import type { CorridorBuilderOptions } from "./index.js";
import { DEFAULT_CORRIDOR_OPTIONS } from "./index.js";
import { edgeCompatibility } from "./edge-compatibility.js";

/**
 * Get the counterpart edge ID for bidirectional edges.
 * Bidirectional edges use ':f' (forward) and ':r' (reverse) suffixes.
 * One-way edges have no suffix and return null.
 */
export function getCounterpartEdgeId(edgeId: string): string | null {
  if (edgeId.endsWith(":f")) {
    return edgeId.slice(0, -2) + ":r";
  }
  if (edgeId.endsWith(":r")) {
    return edgeId.slice(0, -2) + ":f";
  }
  return null;
}

/**
 * Mark an edge and its bidirectional counterpart as visited.
 */
function markVisited(visited: Set<string>, edgeId: string): void {
  visited.add(edgeId);
  const counterpart = getCounterpartEdgeId(edgeId);
  if (counterpart) {
    visited.add(counterpart);
  }
}

/** A chain of contiguous, compatible edges forming a corridor candidate */
export interface EdgeChain {
  edgeIds: string[];
  startNodeId: string;
  endNodeId: string;
  totalLengthMeters: number;
}

/**
 * Build a reverse adjacency map: nodeId -> edgeIds that have toNodeId = nodeId.
 */
function buildReverseAdjacency(graph: Graph): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  for (const [edgeId, edge] of graph.edges) {
    const list = reverse.get(edge.toNodeId);
    if (list) {
      list.push(edgeId);
    } else {
      reverse.set(edge.toNodeId, [edgeId]);
    }
  }
  return reverse;
}

/**
 * Compute the bearing (in degrees, 0-360) from coordinate a to coordinate b.
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

/**
 * Compute the exit bearing of an edge (bearing from second-to-last to last coordinate).
 */
function exitBearing(edge: GraphEdge): number {
  const geom = edge.geometry;
  if (geom.length < 2) {
    return 0;
  }
  return bearing(geom[geom.length - 2]!, geom[geom.length - 1]!);
}

/**
 * Compute the entry bearing of an edge (bearing from first to second coordinate).
 */
function entryBearing(edge: GraphEdge): number {
  const geom = edge.geometry;
  if (geom.length < 2) {
    return 0;
  }
  return bearing(geom[0]!, geom[1]!);
}

/**
 * Compute the absolute angle change between two bearings (0-180 degrees).
 */
function angleDifference(bearing1: number, bearing2: number): number {
  let diff = Math.abs(bearing1 - bearing2) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Build chains of compatible edges by walking the graph.
 *
 * Every edge in the graph ends up in exactly one chain. At intersections
 * (degree > 2), the algorithm picks the single most compatible continuation
 * or stops if none score above the compatibility threshold.
 *
 * @param graph - The input graph
 * @param options - Corridor builder options
 * @returns Array of edge chains
 */
export function buildChains(
  graph: Graph,
  options?: CorridorBuilderOptions
): EdgeChain[] {
  const opts = { ...DEFAULT_CORRIDOR_OPTIONS, ...options };
  const visited = new Set<string>();
  const reverseAdj = buildReverseAdjacency(graph);
  const chains: EdgeChain[] = [];
  const COMPATIBILITY_THRESHOLD = 0.5;

  for (const [edgeId, edge] of graph.edges) {
    if (visited.has(edgeId)) continue;

    markVisited(visited, edgeId);

    // Start chain with this edge
    const chainEdgeIds: string[] = [edgeId];
    let totalLength = edge.attributes.lengthMeters;

    // Extend forward from the toNode of the last edge in the chain
    let currentEdge = edge;
    while (true) {
      const nextEdge = findBestForwardContinuation(
        graph,
        currentEdge,
        visited,
        opts,
        COMPATIBILITY_THRESHOLD
      );
      if (!nextEdge) break;
      markVisited(visited, nextEdge.id);
      chainEdgeIds.push(nextEdge.id);
      totalLength += nextEdge.attributes.lengthMeters;
      currentEdge = nextEdge;
    }

    // Extend backward from the fromNode of the first edge in the chain
    currentEdge = edge;
    while (true) {
      const prevEdge = findBestBackwardContinuation(
        graph,
        reverseAdj,
        currentEdge,
        visited,
        opts,
        COMPATIBILITY_THRESHOLD
      );
      if (!prevEdge) break;
      markVisited(visited, prevEdge.id);
      chainEdgeIds.unshift(prevEdge.id);
      totalLength += prevEdge.attributes.lengthMeters;
      currentEdge = prevEdge;
    }

    const firstEdge = graph.edges.get(chainEdgeIds[0]!)!;
    const lastEdge = graph.edges.get(chainEdgeIds[chainEdgeIds.length - 1]!)!;

    chains.push({
      edgeIds: chainEdgeIds,
      startNodeId: firstEdge.fromNodeId,
      endNodeId: lastEdge.toNodeId,
      totalLengthMeters: totalLength,
    });
  }

  return chains;
}

/**
 * Find the best forward continuation from the toNode of the current edge.
 * Looks at outgoing edges from adjacency, picks the most compatible unvisited one.
 */
function findBestForwardContinuation(
  graph: Graph,
  currentEdge: GraphEdge,
  visited: Set<string>,
  opts: Required<CorridorBuilderOptions>,
  threshold: number
): GraphEdge | null {
  const nodeId = currentEdge.toNodeId;
  const outgoing = graph.adjacency.get(nodeId) ?? [];

  let bestEdge: GraphEdge | null = null;
  let bestScore = -1;

  for (const candidateId of outgoing) {
    if (visited.has(candidateId)) continue;
    const candidate = graph.edges.get(candidateId);
    if (!candidate) continue;

    // Check angle constraint
    const exitB = exitBearing(currentEdge);
    const entryB = entryBearing(candidate);
    const angleDiff = angleDifference(exitB, entryB);
    if (angleDiff > opts.maxAngleChange) continue;

    const score = edgeCompatibility(
      currentEdge.attributes,
      candidate.attributes,
      opts
    );
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestEdge = candidate;
    }
  }

  return bestEdge;
}

/**
 * Find the best backward continuation into the fromNode of the current edge.
 * Looks at edges that END at the fromNode (reverse adjacency), picks the most compatible.
 */
function findBestBackwardContinuation(
  graph: Graph,
  reverseAdj: Map<string, string[]>,
  currentEdge: GraphEdge,
  visited: Set<string>,
  opts: Required<CorridorBuilderOptions>,
  threshold: number
): GraphEdge | null {
  const nodeId = currentEdge.fromNodeId;
  const incoming = reverseAdj.get(nodeId) ?? [];

  let bestEdge: GraphEdge | null = null;
  let bestScore = -1;

  for (const candidateId of incoming) {
    if (visited.has(candidateId)) continue;
    const candidate = graph.edges.get(candidateId);
    if (!candidate) continue;

    // Check angle: the candidate's exit should align with current edge's entry
    const exitB = exitBearing(candidate);
    const entryB = entryBearing(currentEdge);
    const angleDiff = angleDifference(exitB, entryB);
    if (angleDiff > opts.maxAngleChange) continue;

    const score = edgeCompatibility(
      candidate.attributes,
      currentEdge.attributes,
      opts
    );
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestEdge = candidate;
    }
  }

  return bestEdge;
}
