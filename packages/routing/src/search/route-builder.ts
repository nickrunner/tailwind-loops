/**
 * Convert beam search candidates into Route objects with full geometry and stats.
 *
 * Groups consecutive graph edges belonging to the same corridor into
 * CorridorSegments, and connector edges into ConnectingSegments.
 */

import type {
  CorridorNetwork,
  Graph,
  Route,
  RouteSegment,
  RouteStats,
  CorridorType,
  Coordinate,
  SurfaceType,
} from "@tailwind-loops/types";
import type { SearchCandidate } from "./beam-search.js";

/**
 * Convert a search candidate into a complete Route object.
 *
 * Walks edgePath + corridorPath, grouping consecutive edges from the same
 * corridor into CorridorSegments. Connector edges become ConnectingSegments.
 */
export function candidateToRoute(
  candidate: SearchCandidate,
  network: CorridorNetwork,
  graph: Graph,
  routeIndex: number,
): Route {
  const segments: RouteSegment[] = [];
  const geometry: Coordinate[] = [];

  // Group consecutive edges by their parent corridor/connector
  let i = 0;
  while (i < candidate.edgePath.length) {
    const corridorId = candidate.corridorPath[i]!;
    const corridor = network.corridors.get(corridorId);

    if (corridor) {
      // Collect consecutive edges from the same corridor
      const edgeIds: string[] = [];
      while (i < candidate.edgePath.length && candidate.corridorPath[i] === corridorId) {
        edgeIds.push(candidate.edgePath[i]!);
        i++;
      }

      // Determine traversal direction by comparing first edge's node to corridor start
      const firstEdge = graph.edges.get(edgeIds[0]!);
      const entryNodeId = candidate.nodePath[i - edgeIds.length]!;
      const reversed = entryNodeId !== corridor.startNodeId;

      segments.push({ kind: "corridor", corridor, reversed, traversedEdgeIds: edgeIds });

      // Build geometry from individual graph edges
      for (const edgeId of edgeIds) {
        const edge = graph.edges.get(edgeId);
        if (!edge) continue;
        // Determine if this individual edge is traversed in reverse
        const edgeNodeIdx = candidate.edgePath.indexOf(edgeId);
        const edgeEntryNode = candidate.nodePath[edgeNodeIdx]!;
        const edgeReversed = edgeEntryNode !== edge.fromNodeId;
        const coords = edgeReversed ? [...edge.geometry].reverse() : edge.geometry;
        appendGeometry(geometry, coords);
      }
    } else {
      // Connector — collect consecutive edges from same connector
      const edgeIds: string[] = [];
      while (i < candidate.edgePath.length && candidate.corridorPath[i] === corridorId) {
        edgeIds.push(candidate.edgePath[i]!);
        i++;
      }

      const edges = edgeIds
        .map((eid) => graph.edges.get(eid))
        .filter((e) => e != null);

      segments.push({ kind: "connecting", edges });

      for (const edgeId of edgeIds) {
        const edge = graph.edges.get(edgeId);
        if (!edge) continue;
        const edgeNodeIdx = candidate.edgePath.indexOf(edgeId);
        const edgeEntryNode = candidate.nodePath[edgeNodeIdx]!;
        const edgeReversed = edgeEntryNode !== edge.fromNodeId;
        const coords = edgeReversed ? [...edge.geometry].reverse() : edge.geometry;
        appendGeometry(geometry, coords);
      }
    }
  }

  const stats = computeStats(segments, candidate, graph);
  const avgScore =
    candidate.corridorDistance > 0
      ? candidate.weightedScoreSum / candidate.corridorDistance
      : 0;

  return {
    id: `route-${routeIndex}`,
    segments,
    stats,
    geometry,
    score: avgScore,
  };
}

function appendGeometry(target: Coordinate[], source: Coordinate[]): void {
  if (source.length === 0) return;
  const startIdx =
    target.length > 0 && isSameCoord(target[target.length - 1]!, source[0]!) ? 1 : 0;
  for (let i = startIdx; i < source.length; i++) {
    target.push(source[i]!);
  }
}

function isSameCoord(a: Coordinate, b: Coordinate): boolean {
  return Math.abs(a.lat - b.lat) < 1e-8 && Math.abs(a.lng - b.lng) < 1e-8;
}

function computeStats(
  segments: RouteSegment[],
  candidate: SearchCandidate,
  graph: Graph,
): RouteStats {
  let totalStops = 0;
  let totalInfraLength = 0;
  let totalCorridorLength = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let maxGrade = 0;
  let hasElevation = false;
  const distByType: Record<string, number> = {};
  const distBySurface: Record<string, number> = { paved: 0, unpaved: 0, unknown: 0 };

  for (const seg of segments) {
    if (seg.kind === "corridor") {
      const attrs = seg.corridor.attributes;

      // Compute actual traversed length from graph edges (may be a subset of corridor)
      let traversedLength = 0;
      for (const edgeId of seg.traversedEdgeIds) {
        const edge = graph.edges.get(edgeId);
        if (!edge) continue;
        traversedLength += edge.attributes.lengthMeters;
        if (edge.attributes.elevationGain != null) {
          hasElevation = true;
          elevationGain += edge.attributes.elevationGain;
          elevationLoss += edge.attributes.elevationLoss ?? 0;
          if (edge.attributes.maxGrade != null && Math.abs(edge.attributes.maxGrade) > maxGrade) {
            maxGrade = Math.abs(edge.attributes.maxGrade);
          }
        }
      }

      totalCorridorLength += traversedLength;

      // Scale density-based stats by actual traversed length
      totalStops += Math.round(attrs.stopDensityPerKm * (traversedLength / 1000));
      totalInfraLength += attrs.bicycleInfraContinuity * traversedLength;
      const type = seg.corridor.type;
      distByType[type] = (distByType[type] ?? 0) + traversedLength;
      const surface = attrs.predominantSurface;
      distBySurface[surface] = (distBySurface[surface] ?? 0) + traversedLength;
    }
  }

  const avgInfra = totalCorridorLength > 0 ? totalInfraLength / totalCorridorLength : 0;
  const corridorSegments = segments.filter((s) => s.kind === "corridor");
  const avgSegLen = corridorSegments.length > 0
    ? totalCorridorLength / corridorSegments.length
    : 0;
  const flowScore = Math.min(1, Math.log(1 + avgSegLen / 300) / Math.log(1 + 10000 / 300));

  const stats: RouteStats = {
    totalDistanceMeters: candidate.distanceSoFar,
    totalStops,
    distanceByCorridorType: distByType as Record<CorridorType, number>,
    distanceBySurface: distBySurface as Record<SurfaceType, number>,
    averageInfrastructureContinuity: Math.round(avgInfra * 100) / 100,
    flowScore: Math.round(flowScore * 100) / 100,
  };

  if (hasElevation) {
    stats.elevationGainMeters = Math.round(elevationGain);
    stats.elevationLossMeters = Math.round(elevationLoss);
    stats.maxGradePercent = Math.round(maxGrade * 100) / 100;
  }

  return stats;
}
