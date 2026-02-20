/**
 * Core beam search algorithm for loop route generation.
 *
 * Given a search graph, start node, and target distance, explores the graph
 * to find high-quality loop routes. Uses a three-phase heuristic (outbound,
 * explore, return) with score-weighted beam pruning. Direction and quality
 * are complementary — each phase seeks the best corridors in a phase-appropriate
 * direction, with BFS handling the final navigation home.
 *
 * The search operates at the individual graph-edge level (not whole corridors),
 * so routes can enter/exit corridors at any intermediate intersection.
 */

import type { Coordinate } from "@tailwind-loops/types";
import type { SearchGraph, SearchEdge } from "./search-graph.js";
import { haversineDistance, bearing } from "./snap.js";

/**
 * BFS to find a short path from a node back to the start node.
 *
 * Used to "close the loop" once the beam search has found a good route
 * that's near home. The beam search is great at exploration but terrible
 * at point-to-point navigation — this handles the last mile.
 *
 * Ignores the candidate's visited edges (allows retracing outbound edges
 * near home) but stays within a radius of the start to keep the closing
 * path short and direct.
 */
function findClosingPath(
  searchGraph: SearchGraph,
  fromNodeId: string,
  startNodeId: string,
  startCoord: Coordinate,
  maxRadius: number,
  maxEdges: number = 50,
): { edgeIds: string[]; corridorIds: string[]; nodeIds: string[]; distance: number } | null {
  // BFS with distance tracking
  interface BfsState {
    nodeId: string;
    edgeIds: string[];
    corridorIds: string[];
    nodeIds: string[];
    distance: number;
  }

  const visited = new Set<string>([fromNodeId]);
  const queue: BfsState[] = [{
    nodeId: fromNodeId,
    edgeIds: [],
    corridorIds: [],
    nodeIds: [],
    distance: 0,
  }];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.edgeIds.length >= maxEdges) continue;

    const edges = searchGraph.adjacency.get(current.nodeId);
    if (!edges) continue;

    for (const edge of edges) {
      if (visited.has(edge.targetNodeId)) continue;

      const targetCoord = searchGraph.nodeCoordinates.get(edge.targetNodeId);
      if (!targetCoord) continue;

      // Stay within radius of start
      const distToStart = haversineDistance(targetCoord, startCoord);
      if (distToStart > maxRadius) continue;

      const newEdgeIds = [...current.edgeIds, edge.graphEdgeId];
      const newCorridorIds = [...current.corridorIds, edge.corridorId];
      const newNodeIds = [...current.nodeIds, edge.targetNodeId];
      const newDistance = current.distance + edge.lengthMeters;

      // Found the start!
      if (edge.targetNodeId === startNodeId) {
        return {
          edgeIds: newEdgeIds,
          corridorIds: newCorridorIds,
          nodeIds: newNodeIds,
          distance: newDistance,
        };
      }

      visited.add(edge.targetNodeId);
      queue.push({
        nodeId: edge.targetNodeId,
        edgeIds: newEdgeIds,
        corridorIds: newCorridorIds,
        nodeIds: newNodeIds,
        distance: newDistance,
      });
    }
  }

  return null; // No path found
}

/** A candidate route being explored during beam search */
export interface SearchCandidate {
  /** Graph edge IDs traversed (in order) */
  edgePath: string[];
  /** Parent corridor/connector IDs for each edge (parallel to edgePath) */
  corridorPath: string[];
  /** Node IDs visited (in order, length = edgePath.length + 1) */
  nodePath: string[];
  /** Current position in the graph */
  currentNodeId: string;
  /** Total distance traveled so far (meters) */
  distanceSoFar: number;
  /** Sum of (score x length) for corridor segments only */
  weightedScoreSum: number;
  /** Total distance on corridors only (for weighted average) */
  corridorDistance: number;
  /** Sum of crossing difficulty penalties from connectors */
  connectorPenaltySum: number;
  /** Set of graph edge IDs already traversed (no re-traversal) */
  visitedEdges: Set<string>;
  /** Score of the most recently traversed edge (for edge-level quality signal) */
  lastEdgeScore: number;
}

/** Options for the beam search */
export interface BeamSearchOptions {
  /** Number of candidates to keep per iteration (default 50) */
  beamWidth?: number;
  /** Minimum acceptable distance in meters */
  minDistance: number;
  /** Maximum acceptable distance in meters */
  maxDistance: number;
  /** Preferred outward compass bearing (degrees), or undefined for any */
  preferredDirection?: number;
  /** Turn frequency preference */
  turnFrequency?: "minimal" | "moderate" | "frequent";
  /** Maximum number of completed routes to return (default 3) */
  maxAlternatives?: number;
}

const DEFAULT_BEAM_WIDTH = 200;
const DEFAULT_MAX_ALTERNATIVES = 3;
const MAX_ITERATIONS = 5000;
const JACCARD_DEDUP_THRESHOLD = 0.7;
/** Radius around start where edge revisiting is allowed (to close the loop) */
const HOME_ZONE_RADIUS = 1500;

/**
 * Run beam search to find loop routes.
 *
 * @returns Completed candidates sorted by score (best first), deduplicated
 */
export function generateLoops(
  searchGraph: SearchGraph,
  startNodeId: string,
  options: BeamSearchOptions,
): SearchCandidate[] {
  const beamWidth = options.beamWidth ?? DEFAULT_BEAM_WIDTH;
  const minDistance = options.minDistance;
  const maxDistance = options.maxDistance;
  const midDistance = (minDistance + maxDistance) / 2;
  // If no preferred direction, pick a random one so each run explores differently
  const preferredDirection = options.preferredDirection ?? Math.floor(Math.random() * 360);
  const turnFrequency = options.turnFrequency ?? "moderate";
  const maxAlternatives = options.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES;

  // Completion requires being at least minDistance
  const minCompletionDistance = minDistance;
  // Return budget: use maxDistance as the cap for return pruning
  const returnBudget = maxDistance;
  // Hard cap: absolute maximum to prevent unbounded exploration
  const hardDistanceCap = maxDistance * 1.5;
  const startCoord = searchGraph.nodeCoordinates.get(startNodeId);
  if (!startCoord) return [];

  // Initialize beam with a single candidate at the start node
  let beam: SearchCandidate[] = [
    {
      edgePath: [],
      corridorPath: [],
      nodePath: [startNodeId],
      currentNodeId: startNodeId,
      distanceSoFar: 0,
      weightedScoreSum: 0,
      corridorDistance: 0,
      connectorPenaltySum: 0,
      visitedEdges: new Set(),
      lastEdgeScore: 1,
    },
  ];

  const completed: SearchCandidate[] = [];

  // Track best candidates throughout the search for fallback closing.
  // If the main search finds 0 routes, we'll try aggressive BFS from these.
  const MAX_FALLBACK_CANDIDATES = 20;
  let fallbackCandidates: SearchCandidate[] = [];

  const dirLabel = options.preferredDirection != null ? `${preferredDirection}° (user)` : `${preferredDirection}° (random)`;
  console.log(`[beam] Starting: range=${(minDistance / 1000).toFixed(1)}-${(maxDistance / 1000).toFixed(1)}km, beamWidth=${beamWidth}, direction=${dirLabel}, nodes=${searchGraph.nodeCoordinates.size}`);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (beam.length === 0) {
      console.log(`[beam] Iter ${iter}: beam empty, stopping`);
      break;
    }
    if (completed.length >= maxAlternatives) {
      console.log(`[beam] Iter ${iter}: enough completed (${completed.length}), stopping`);
      break;
    }

    const nextBeam: SearchCandidate[] = [];
    let expandedCount = 0;
    let prunedDistance = 0;
    let prunedReturn = 0;
    let skippedVisited = 0;
    let skippedNoCoord = 0;
    let skippedNoEdges = 0;
    let skippedEarlyReturn = 0;

    for (const candidate of beam) {
      const edges = searchGraph.adjacency.get(candidate.currentNodeId);
      if (!edges) { skippedNoEdges++; continue; }

      // Dump detail for the first couple of iterations
      if (iter < 3 && beam.length <= 5) {
        console.log(`[beam]   Node ${candidate.currentNodeId}: ${edges.length} edges, visitedEdges=${candidate.visitedEdges.size}, dist=${(candidate.distanceSoFar / 1000).toFixed(1)}km`);
      }

      for (const edge of edges) {
        // No re-traversing the same graph edge — UNLESS we're closing the loop.
        // Allow revisiting edges within HOME_ZONE_RADIUS of start when the candidate
        // has traveled enough distance. This solves the "last mile" problem where
        // candidates can't close the loop because outbound edges block the return.
        if (candidate.visitedEdges.has(edge.graphEdgeId)) {
          const edgeTarget = searchGraph.nodeCoordinates.get(edge.targetNodeId);
          const edgeDistToStart = edgeTarget ? haversineDistance(edgeTarget, startCoord) : Infinity;
          const canRevisitNearHome =
            candidate.distanceSoFar > minDistance * 0.80 &&
            edgeDistToStart < HOME_ZONE_RADIUS;
          if (!canRevisitNearHome) { skippedVisited++; continue; }
        }

        const newDistance = candidate.distanceSoFar + edge.lengthMeters;

        // Prune: exceeded hard distance cap (3x target — very generous)
        if (newDistance > hardDistanceCap) { prunedDistance++; continue; }

        const targetCoord = searchGraph.nodeCoordinates.get(edge.targetNodeId);
        if (!targetCoord) { skippedNoCoord++; continue; }

        const distToStart = haversineDistance(targetCoord, startCoord);
        const remaining = returnBudget - newDistance;

        // Prune: too far from start to return within remaining budget.
        // Road networks require ~1.4x straight-line distance, so 0.7 slack.
        if (remaining > 0 && distToStart > remaining * 0.7) { prunedReturn++; continue; }
        // Also prune if we've exceeded the return budget and still far from start
        if (remaining <= 0 && distToStart > HOME_ZONE_RADIUS) { prunedReturn++; continue; }

        // Build new candidate
        const newVisited = new Set(candidate.visitedEdges);
        newVisited.add(edge.graphEdgeId);

        const newCorridorDistance =
          candidate.corridorDistance + (edge.kind === "corridor" ? edge.lengthMeters : 0);
        const newWeightedScoreSum =
          candidate.weightedScoreSum +
          (edge.kind === "corridor" ? edge.score * edge.lengthMeters : 0);
        const newConnectorPenalty =
          candidate.connectorPenaltySum +
          (edge.kind === "connector" ? (1 - edge.score) * 0.05 : 0);

        const newCandidate: SearchCandidate = {
          edgePath: [...candidate.edgePath, edge.graphEdgeId],
          corridorPath: [...candidate.corridorPath, edge.corridorId],
          nodePath: [...candidate.nodePath, edge.targetNodeId],
          currentNodeId: edge.targetNodeId,
          distanceSoFar: newDistance,
          weightedScoreSum: newWeightedScoreSum,
          corridorDistance: newCorridorDistance,
          connectorPenaltySum: newConnectorPenalty,
          visitedEdges: newVisited,
          lastEdgeScore: edge.score,
        };

        // Check if this candidate completes a loop:
        // - Exact start node: allowed when distance >= minDistance
        // - Near start (within 1km): also requires >= minDistance
        //   The 1km radius handles real barriers (highways, rivers) near the start point
        const isAtStart = edge.targetNodeId === startNodeId;
        const isNearStart = !isAtStart && distToStart < 1000;

        if (isAtStart && newDistance >= minDistance) {
          completed.push(newCandidate);
          continue;
        }
        if (isNearStart && newDistance >= minDistance) {
          completed.push(newCandidate);
          continue;
        }

        // Don't add candidates that returned to start too early
        if (isAtStart && newDistance < minDistance) {
          skippedEarlyReturn++;
          continue;
        }

        expandedCount++;
        nextBeam.push(newCandidate);
      }
    }

    // --- Closing BFS ---
    // The beam search is great at exploration but bad at navigation.
    // Once candidates are near home with enough distance, use BFS to
    // find the actual path home instead of hoping the beam stumbles onto it.
    let closedByBfs = 0;
    if (completed.length < maxAlternatives) {
      for (const candidate of nextBeam) {
        // Only close candidates that are at least 80% of minDistance (allow BFS path to add distance).
        if (candidate.distanceSoFar < minDistance * 0.80) continue;

        const coord = searchGraph.nodeCoordinates.get(candidate.currentNodeId);
        if (!coord) continue;

        const distHome = haversineDistance(coord, startCoord);
        if (distHome > 5000) continue; // Only try for candidates within 5km of start

        const closing = findClosingPath(
          searchGraph,
          candidate.currentNodeId,
          startNodeId,
          startCoord,
          Math.max(5000, distHome * 1.3), // Generous radius for road network indirectness
        );

        if (closing) {
          // Append the closing path to the candidate
          const closedCandidate: SearchCandidate = {
            edgePath: [...candidate.edgePath, ...closing.edgeIds],
            corridorPath: [...candidate.corridorPath, ...closing.corridorIds],
            nodePath: [...candidate.nodePath, ...closing.nodeIds],
            currentNodeId: startNodeId,
            distanceSoFar: candidate.distanceSoFar + closing.distance,
            weightedScoreSum: candidate.weightedScoreSum, // closing path doesn't add to score
            corridorDistance: candidate.corridorDistance,
            connectorPenaltySum: candidate.connectorPenaltySum,
            visitedEdges: new Set([...candidate.visitedEdges, ...closing.edgeIds]),
            lastEdgeScore: candidate.lastEdgeScore,
          };
          // Only accept if total distance meets minimum
          if (closedCandidate.distanceSoFar >= minDistance) {
            completed.push(closedCandidate);
            closedByBfs++;
          }
        }
      }
      if (closedByBfs > 0) {
        console.log(`[beam] Iter ${iter}: closed ${closedByBfs} route(s) via BFS`);
      }
    }

    if (iter % 25 === 0 || iter < 5) {
      const bestDist = beam.length > 0
        ? Math.max(...beam.map(c => c.distanceSoFar))
        : 0;
      // Track closest candidate to start (that has traveled enough to matter)
      let closestToStart = Infinity;
      for (const c of beam) {
        const coord = searchGraph.nodeCoordinates.get(c.currentNodeId);
        if (coord && c.distanceSoFar > midDistance * 0.3) {
          const d = haversineDistance(coord, startCoord);
          if (d < closestToStart) closestToStart = d;
        }
      }
      const closestStr = closestToStart < Infinity ? `${(closestToStart / 1000).toFixed(1)}km` : '-';
      console.log(`[beam] Iter ${iter}: beam=${beam.length}, expanded=${expandedCount}, nextBeam=${nextBeam.length}, completed=${completed.length}, prunedDist=${prunedDistance}, prunedReturn=${prunedReturn}, visited=${skippedVisited}, earlyReturn=${skippedEarlyReturn}, bestDist=${(bestDist / 1000).toFixed(1)}km, closestHome=${closestStr}`);
    }

    // Track best candidates for fallback closing (in case we end with 0 routes).
    // Keep candidates that have traveled at least 50% of midDistance — these are worth closing.
    if (completed.length === 0) {
      const viable = nextBeam.filter((c) => c.distanceSoFar >= midDistance * 0.5);
      if (viable.length > 0) {
        // Score by corridor quality
        const scored2 = viable.map((c) => ({
          candidate: c,
          avgScore: c.corridorDistance > 0 ? c.weightedScoreSum / c.corridorDistance : 0,
        }));
        scored2.sort((a, b) => b.avgScore - a.avgScore);
        fallbackCandidates = scored2.slice(0, MAX_FALLBACK_CANDIDATES).map((s) => s.candidate);
      }
    }

    // Score and prune to beam width
    beam = pruneBeam(
      nextBeam,
      beamWidth,
      startCoord,
      midDistance,
      maxDistance,
      searchGraph,
      preferredDirection,
      turnFrequency,
    );
  }

  // --- Fallback closing ---
  // If we found 0 routes, aggressively try BFS from the best candidates
  // we tracked. Better to return a route that overshoots than nothing at all.
  if (completed.length === 0 && fallbackCandidates.length > 0) {
    console.log(`[beam] 0 routes found — attempting fallback BFS from ${fallbackCandidates.length} candidates`);

    for (const candidate of fallbackCandidates) {
      if (completed.length >= maxAlternatives) break;

      const coord = searchGraph.nodeCoordinates.get(candidate.currentNodeId);
      if (!coord) continue;

      const distHome = haversineDistance(coord, startCoord);
      // Allow BFS to explore a generous radius: candidate's distance to start
      // plus buffer for road network indirectness. No less than 5km.
      const fallbackRadius = Math.max(5000, distHome * 1.5);

      const closing = findClosingPath(
        searchGraph,
        candidate.currentNodeId,
        startNodeId,
        startCoord,
        fallbackRadius,
        200, // generous edge limit
      );

      if (closing) {
        const closedCandidate: SearchCandidate = {
          edgePath: [...candidate.edgePath, ...closing.edgeIds],
          corridorPath: [...candidate.corridorPath, ...closing.corridorIds],
          nodePath: [...candidate.nodePath, ...closing.nodeIds],
          currentNodeId: startNodeId,
          distanceSoFar: candidate.distanceSoFar + closing.distance,
          weightedScoreSum: candidate.weightedScoreSum,
          corridorDistance: candidate.corridorDistance,
          connectorPenaltySum: candidate.connectorPenaltySum,
          visitedEdges: new Set([...candidate.visitedEdges, ...closing.edgeIds]),
          lastEdgeScore: candidate.lastEdgeScore,
        };
        completed.push(closedCandidate);
        console.log(`[beam] Fallback closed: ${(closedCandidate.distanceSoFar / 1000).toFixed(1)}km (BFS from ${(distHome / 1000).toFixed(1)}km away, closing path ${(closing.distance / 1000).toFixed(1)}km)`);
      }
    }

    if (completed.length === 0) {
      console.log(`[beam] Fallback BFS failed — no path home from any candidate`);
    }
  }

  // Score and sort completed routes
  console.log(`[beam] Done: ${completed.length} completed routes found`);
  for (const c of completed) {
    console.log(`[beam]   ${(c.distanceSoFar / 1000).toFixed(1)}km, ${c.edgePath.length} edges, avgScore=${c.corridorDistance > 0 ? (c.weightedScoreSum / c.corridorDistance).toFixed(3) : "n/a"}`);
  }

  const scored = completed.map((c) => ({
    candidate: c,
    score: scoreCompleted(c, minDistance, maxDistance, turnFrequency),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by Jaccard similarity
  return deduplicateRoutes(
    scored.map((s) => s.candidate),
    maxAlternatives,
  );
}

/**
 * Score an active candidate for beam pruning.
 *
 * Three-phase strategy — direction and quality are complementary, not competing:
 * - Outbound (0-33%):  best corridors heading AWAY from start
 * - Explore  (33-66%): best corridors, no directional bias — run free
 * - Return   (66-100%): best corridors heading TOWARD start (BFS handles navigation)
 *
 * @param midDistance - midpoint of [minDistance, maxDistance] range, used for phase transitions
 */
function scoreActive(
  candidate: SearchCandidate,
  startCoord: Coordinate,
  midDistance: number,
  searchGraph: SearchGraph,
  preferredDirection?: number,
  turnFrequency?: "minimal" | "moderate" | "frequent",
): number {
  const avgScore =
    candidate.corridorDistance > 0
      ? candidate.weightedScoreSum / candidate.corridorDistance
      : 0.5;

  const budgetFraction = candidate.distanceSoFar / midDistance;
  const currentCoord = searchGraph.nodeCoordinates.get(candidate.currentNodeId);
  let directionalScore = 0.5; // neutral default

  if (currentCoord) {
    const distToStart = haversineDistance(currentCoord, startCoord);

    if (budgetFraction < 0.33) {
      // Phase 1 — Outbound: reward moving away from start.
      // Find the best corridors in the outward direction.
      const expectedOutward = Math.max(1000, candidate.distanceSoFar * 0.4);
      directionalScore = Math.min(1, distToStart / expectedOutward);
      if (preferredDirection != null && distToStart > 100) {
        const currentBearing = bearing(startCoord, currentCoord);
        const angleDiff = Math.abs(currentBearing - preferredDirection);
        const normalizedDiff = Math.min(angleDiff, 360 - angleDiff) / 180;
        directionalScore *= 1 - normalizedDiff * 0.5;
      }
    } else if (budgetFraction < 0.66) {
      // Phase 2 — Explore: no directional bias, just run free.
      // All candidates get the same directional score — only quality matters.
      directionalScore = 0.5;
    } else {
      // Phase 3 — Return: reward getting closer to start.
      // Gentle pressure — BFS handles actual navigation home.
      const remaining = midDistance - candidate.distanceSoFar;
      if (remaining > 0) {
        const ratio = distToStart / remaining;
        // Gentler than before: ratio=0 → 1.0, ratio=0.5 → 0.61, ratio=1.0 → 0.37
        directionalScore = Math.exp(-ratio);
      } else {
        directionalScore = Math.max(0, 1 - distToStart / HOME_ZONE_RADIUS);
      }
    }
  }

  // Quality is always the dominant signal. Direction is a complementary nudge
  // that steers candidates in the right phase-appropriate direction without
  // sacrificing corridor quality.
  const qualityWeight = 0.65;
  const directionWeight = 0.10;
  const noveltyWeight = 0.05;

  const edgeCount = candidate.edgePath.length;
  const novelty = edgeCount > 0
    ? candidate.visitedEdges.size / edgeCount
    : 1;

  // Penalize candidates that just took a low-quality edge.
  // Aggressive penalty: score < 0.75 gets penalized, up to 0.25 at score 0.
  // This strongly discourages taking any mediocre corridor.
  const lastScore = candidate.lastEdgeScore;
  const edgeQualityPenalty = lastScore < 0.75
    ? (0.75 - lastScore) * 0.5
    : 0;

  let turnModifier = 0;
  if (turnFrequency === "minimal") {
    const edgesPerKm = edgeCount / Math.max(1, candidate.distanceSoFar / 1000);
    turnModifier = -0.05 * Math.max(0, edgesPerKm - 2);
  } else if (turnFrequency === "frequent") {
    turnModifier = 0.02 * Math.min(10, candidate.visitedEdges.size);
  }

  return (
    qualityWeight * avgScore +
    directionWeight * directionalScore +
    noveltyWeight * novelty -
    candidate.connectorPenaltySum -
    edgeQualityPenalty +
    turnModifier
  );
}

/**
 * Score a completed route for final ranking.
 *
 * Distance penalty: zero within [minDistance, maxDistance], scales linearly outside.
 */
function scoreCompleted(
  candidate: SearchCandidate,
  minDistance: number,
  maxDistance: number,
  turnFrequency: "minimal" | "moderate" | "frequent",
): number {
  const avgScore =
    candidate.corridorDistance > 0
      ? candidate.weightedScoreSum / candidate.corridorDistance
      : 0;

  // Within range: no penalty. Outside range: linear penalty.
  const actual = candidate.distanceSoFar;
  let distancePenalty = 0;
  if (actual < minDistance) {
    distancePenalty = (minDistance - actual) / minDistance * 0.5;
  } else if (actual > maxDistance) {
    distancePenalty = (actual - maxDistance) / maxDistance * 0.5;
  }

  const edgeCount = candidate.edgePath.length;
  const novelty = edgeCount > 0
    ? candidate.visitedEdges.size / edgeCount
    : 0;

  let turnModifier = 0;
  if (turnFrequency === "minimal") {
    const edgesPerKm = edgeCount / Math.max(1, candidate.distanceSoFar / 1000);
    turnModifier = -0.1 * Math.max(0, edgesPerKm - 2);
  } else if (turnFrequency === "frequent") {
    turnModifier = 0.02 * Math.min(10, candidate.visitedEdges.size);
  }

  // Quality-first: a high-scoring route at the wrong distance beats
  // a low-scoring route at the right distance.
  return (
    avgScore * 2.0 -
    distancePenalty -
    candidate.connectorPenaltySum +
    0.1 * novelty +
    turnModifier
  );
}

/**
 * Prune the beam with three-phase strategy.
 *
 * - Outbound  (<33% budget): spatial bucketing for geographic diversity
 * - Explore   (33-66% budget): pure score-based — run free
 * - Return    (≥66% budget): homebound reservation ramps up,
 *   BFS handles actual navigation home
 *
 * @param midDistance - midpoint of distance range, used for phase transitions
 * @param maxDistance - upper bound of distance range, used for return budget
 */
function pruneBeam(
  candidates: SearchCandidate[],
  beamWidth: number,
  startCoord: Coordinate,
  midDistance: number,
  maxDistance: number,
  searchGraph: SearchGraph,
  preferredDirection?: number,
  turnFrequency?: "minimal" | "moderate" | "frequent",
): SearchCandidate[] {
  if (candidates.length <= beamWidth) return candidates;

  // Stochastic beam search: add small random noise to scores so different
  // candidates survive pruning on each run, producing varied routes.
  const NOISE_SCALE = 0.08;
  const scored = candidates.map((c) => {
    const coord = searchGraph.nodeCoordinates.get(c.currentNodeId);
    const distToStart = coord ? haversineDistance(coord, startCoord) : Infinity;
    const bear = coord ? bearing(startCoord, coord) : 0;
    return {
      candidate: c,
      score: scoreActive(c, startCoord, midDistance, searchGraph, preferredDirection, turnFrequency)
        + (Math.random() - 0.5) * NOISE_SCALE,
      sector: Math.floor(((bear + 22.5) % 360) / 45),
      distToStart,
    };
  });

  const maxDistTraveled = Math.max(...candidates.map((c) => c.distanceSoFar));
  const budgetUsed = maxDistTraveled / midDistance;

  const result: SearchCandidate[] = [];
  const taken = new Set<SearchCandidate>();

  // Homebound reservation: mild preference for candidates heading home.
  // BFS handles actual navigation, this just ensures some diversity toward start.
  // Kicks in at 80% budget, maxes at 20% of beam at 100% budget.
  const homeboundFraction = budgetUsed < 0.80 ? 0
    : Math.min(0.20, (budgetUsed - 0.80) / 0.20 * 0.20);
  const homeboundSlots = Math.floor(beamWidth * homeboundFraction);

  if (homeboundSlots > 0) {
    // Homebound: traveled enough AND closest to start
    // Score by: closeness to start (primary) + route quality (secondary)
    const homebound = scored
      .filter((s) => s.candidate.distanceSoFar > maxDistance * 0.3)
      .sort((a, b) => {
        // Primary: distance to start (closer = better)
        const distDiff = a.distToStart - b.distToStart;
        if (Math.abs(distDiff) > 500) return distDiff;
        // Secondary: route quality score
        return b.score - a.score;
      });

    for (let i = 0; i < Math.min(homeboundSlots, homebound.length); i++) {
      result.push(homebound[i]!.candidate);
      taken.add(homebound[i]!.candidate);
    }
  }

  // Remaining slots: spatial bucketing in outbound phase, score-based otherwise
  const remainingSlots = beamWidth - result.length;

  if (budgetUsed < 0.33) {
    // Outbound phase: spatial bucketing for diversity in all directions
    const NUM_SECTORS = 8;
    const sectors: (typeof scored)[] = Array.from({ length: NUM_SECTORS }, () => []);
    for (const s of scored) {
      if (taken.has(s.candidate)) continue;
      sectors[s.sector]!.push(s);
    }
    for (const sector of sectors) {
      sector.sort((a, b) => b.score - a.score);
    }

    const perSector = Math.max(1, Math.floor(remainingSlots / NUM_SECTORS));
    for (const sector of sectors) {
      for (let i = 0; i < Math.min(perSector, sector.length); i++) {
        result.push(sector[i]!.candidate);
        taken.add(sector[i]!.candidate);
      }
    }
  }

  // Fill remaining by global score (explore + return phases, and leftover outbound slots)
  if (result.length < beamWidth) {
    scored.sort((a, b) => b.score - a.score);
    for (const s of scored) {
      if (result.length >= beamWidth) break;
      if (!taken.has(s.candidate)) {
        result.push(s.candidate);
      }
    }
  }

  return result;
}

/**
 * Deduplicate routes using Jaccard similarity on visited edge sets.
 */
function deduplicateRoutes(
  candidates: SearchCandidate[],
  maxAlternatives: number,
): SearchCandidate[] {
  const result: SearchCandidate[] = [];

  for (const candidate of candidates) {
    if (result.length >= maxAlternatives) break;

    const isDuplicate = result.some((existing) => {
      const intersection = new Set(
        [...candidate.visitedEdges].filter((id) => existing.visitedEdges.has(id)),
      );
      const union = new Set([...candidate.visitedEdges, ...existing.visitedEdges]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;
      return jaccard > JACCARD_DEDUP_THRESHOLD;
    });

    if (!isDuplicate) {
      result.push(candidate);
    }
  }

  return result;
}
