/**
 * Route search module.
 *
 * Generates loop routes by beam-searching the corridor network.
 * The caller scores corridors first; this module operates on scored corridors.
 */

import type {
  Graph,
  CorridorNetwork,
  ActivityType,
  LoopSearchParams,
  RouteAlternatives,
} from "@tailwind-loops/types";
import { buildSearchGraph } from "./search-graph.js";
import { snapToNode } from "./snap.js";
import { generateLoops } from "./beam-search.js";
import { candidateToRoute } from "./route-builder.js";

export { buildSearchGraph, type SearchGraph, type SearchEdge } from "./search-graph.js";
export { snapToNode, haversineDistance, bearing, type SnapResult } from "./snap.js";
export { generateLoops, type SearchCandidate, type BeamSearchOptions } from "./beam-search.js";
export { candidateToRoute } from "./route-builder.js";

/**
 * Generate loop routes from a scored corridor network.
 *
 * @param network - Corridor network with scores already populated
 * @param graph - Underlying street graph (for node coordinates and connector edges)
 * @param activityType - Activity type (determines which corridor scores to use)
 * @param params - Loop search parameters (start point, target distance, etc.)
 * @returns Route alternatives (primary + alternatives), or null if no routes found
 */
export function generateLoopRoutes(
  network: CorridorNetwork,
  graph: Graph,
  activityType: ActivityType,
  params: LoopSearchParams,
): RouteAlternatives | null {
  const t0 = performance.now();

  // 1. Build search graph from scored network
  const searchGraph = buildSearchGraph(network, graph, activityType);
  console.log(`[route] Search graph: ${searchGraph.nodeCoordinates.size} nodes, ${searchGraph.adjacency.size} adjacency entries (${(performance.now() - t0).toFixed(0)}ms)`);

  // 2. Snap start coordinate to nearest node
  const snap = snapToNode(params.startCoordinate, searchGraph);
  if (!snap) {
    console.log(`[route] Failed to snap start coordinate to any node`);
    return null;
  }
  console.log(`[route] Snapped to node ${snap.nodeId} (${snap.snapDistance.toFixed(0)}m away)`);

  // 3. Run beam search
  // Randomize preferred direction if not explicitly set — produces varied routes each run
  const preferredDirection = params.preferredDirection ?? Math.random() * 360;
  console.log(`[route] Preferred direction: ${preferredDirection.toFixed(0)}°`);
  const t1 = performance.now();
  const candidates = generateLoops(searchGraph, snap.nodeId, {
    minDistance: params.minDistanceMeters,
    maxDistance: params.maxDistanceMeters,
    preferredDirection,
    turnFrequency: params.turnFrequency,
    maxAlternatives: params.maxAlternatives,
  });
  console.log(`[route] Beam search: ${candidates.length} routes found (${(performance.now() - t1).toFixed(0)}ms)`);

  if (candidates.length === 0) return null;

  // 4. Convert candidates to Route objects
  const routes = candidates.map((c, i) => candidateToRoute(c, network, graph, i));

  for (const route of routes) {
    console.log(`[route]   ${route.id}: ${(route.stats.totalDistanceMeters / 1609.34).toFixed(1)}mi, score=${route.score.toFixed(3)}, ${route.segments.length} segments`);
  }

  console.log(`[route] Total: ${(performance.now() - t0).toFixed(0)}ms`);

  return {
    primary: routes[0]!,
    alternatives: routes.slice(1),
  };
}
