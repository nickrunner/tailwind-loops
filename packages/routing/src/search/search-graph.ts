/**
 * Search graph construction from CorridorNetwork + Graph.
 *
 * Builds a node-based adjacency graph from the individual graph edges that
 * compose each corridor and connector. Every intermediate junction node within
 * a corridor is a potential turn point — the search is NOT limited to entering
 * or exiting corridors at their endpoints.
 */

import type { CorridorNetwork, Graph, ActivityType, Coordinate } from "@tailwind-loops/types";

/** An edge in the search graph (a single graph edge, tagged with its parent corridor/connector) */
export interface SearchEdge {
  /** The underlying graph edge ID (used for no-revisit tracking) */
  graphEdgeId: string;
  /** Parent corridor or connector ID (used for scoring and route building) */
  corridorId: string;
  /** Whether the parent is a corridor or connector */
  kind: "corridor" | "connector";
  /** Node ID at the other end */
  targetNodeId: string;
  /** Length of this individual graph edge in meters */
  lengthMeters: number;
  /** Score: corridor overall score for the activity, or 1 - crossingDifficulty for connectors */
  score: number;
}

/** Node-based search graph built from a CorridorNetwork */
export interface SearchGraph {
  /** nodeId → outgoing edges */
  adjacency: Map<string, SearchEdge[]>;
  /** nodeId → coordinate (for haversine calculations) */
  nodeCoordinates: Map<string, Coordinate>;
}

/**
 * Build a search graph from a scored corridor network.
 *
 * For each corridor, iterates its constituent graph edges and adds a search
 * edge for each one (forward + reverse unless oneWay). This means every
 * intermediate junction node is reachable, not just corridor endpoints.
 *
 * For connectors, same approach.
 */
export function buildSearchGraph(
  network: CorridorNetwork,
  graph: Graph,
  activityType: ActivityType
): SearchGraph {
  const adjacency = new Map<string, SearchEdge[]>();
  const nodeCoordinates = new Map<string, Coordinate>();
  let missingNodes = 0;
  let missingEdges = 0;

  function addEdge(fromNodeId: string, edge: SearchEdge): void {
    let edges = adjacency.get(fromNodeId);
    if (!edges) {
      edges = [];
      adjacency.set(fromNodeId, edges);
    }
    edges.push(edge);
  }

  function ensureNode(nodeId: string): void {
    if (!nodeCoordinates.has(nodeId)) {
      const node = graph.nodes.get(nodeId);
      if (node) {
        nodeCoordinates.set(nodeId, node.coordinate);
      } else {
        missingNodes++;
      }
    }
  }

  // Corridor types to exclude per activity type
  const EXCLUDED_TYPES: Partial<Record<ActivityType, Set<string>>> = {
    "road-cycling": new Set(["path", "trail"]),
    "gravel-cycling": new Set(["path"])
  };
  const EXCLUDED_SURFACES: Partial<Record<ActivityType, Set<string>>> = {
    "road-cycling": new Set(["unpaved"])
  };
  // Road classes to exclude (e.g., service = parking lots/driveways, track = farm roads)
  const EXCLUDED_ROAD_CLASSES: Partial<Record<ActivityType, Set<string>>> = {
    "road-cycling": new Set(["service", "track", "footway"]),
    "gravel-cycling": new Set(["service", "track", "footway"])
  };
  const excludedTypes = EXCLUDED_TYPES[activityType];
  const excludedSurfaces = EXCLUDED_SURFACES[activityType];
  const excludedRoadClasses = EXCLUDED_ROAD_CLASSES[activityType];
  let skippedCorridors = 0;

  // Add edges from corridors — one search edge per graph edge
  for (const corridor of network.corridors.values()) {
    // Skip corridor types that aren't viable for this activity
    if (excludedTypes?.has(corridor.type)) {
      skippedCorridors++;
      continue;
    }
    if (excludedSurfaces?.has(corridor.attributes.predominantSurface)) {
      skippedCorridors++;
      continue;
    }
    if (excludedRoadClasses?.has(corridor.attributes.predominantRoadClass)) {
      skippedCorridors++;
      continue;
    }

    const score = corridor.scores?.[activityType]?.overall ?? 0.5;

    for (const edgeId of corridor.edgeIds) {
      const graphEdge = graph.edges.get(edgeId);
      if (!graphEdge) {
        missingEdges++;
        continue;
      }

      ensureNode(graphEdge.fromNodeId);
      ensureNode(graphEdge.toNodeId);

      // Forward
      addEdge(graphEdge.fromNodeId, {
        graphEdgeId: edgeId,
        corridorId: corridor.id,
        kind: "corridor",
        targetNodeId: graphEdge.toNodeId,
        lengthMeters: graphEdge.attributes.lengthMeters,
        score
      });

      // Reverse (unless one-way)
      if (!corridor.oneWay) {
        addEdge(graphEdge.toNodeId, {
          graphEdgeId: edgeId,
          corridorId: corridor.id,
          kind: "corridor",
          targetNodeId: graphEdge.fromNodeId,
          lengthMeters: graphEdge.attributes.lengthMeters,
          score
        });
      }
    }
  }

  // Build the set of corridor IDs that survived filtering, so we can skip
  // connectors that no longer bridge 2+ included corridors.
  const includedCorridorIds = new Set<string>();
  for (const corridor of network.corridors.values()) {
    if (excludedTypes?.has(corridor.type)) continue;
    if (excludedSurfaces?.has(corridor.attributes.predominantSurface)) continue;
    if (excludedRoadClasses?.has(corridor.attributes.predominantRoadClass)) continue;
    includedCorridorIds.add(corridor.id);
  }

  // Add edges from connectors — one search edge per graph edge
  let skippedConnectorEdges = 0;
  let skippedConnectors = 0;
  for (const connector of network.connectors.values()) {
    // Skip connectors that don't bridge 2+ included corridors
    const reachableCorridors = connector.corridorIds.filter((id) => includedCorridorIds.has(id));
    if (new Set(reachableCorridors).size < 2) {
      skippedConnectors++;
      continue;
    }

    const score = 1 - connector.attributes.crossingDifficulty;

    for (const edgeId of connector.edgeIds) {
      const graphEdge = graph.edges.get(edgeId);
      if (!graphEdge) {
        missingEdges++;
        continue;
      }

      // Skip connector edges on excluded road classes (e.g., parking lots)
      if (excludedRoadClasses?.has(graphEdge.attributes.roadClass)) {
        skippedConnectorEdges++;
        continue;
      }

      ensureNode(graphEdge.fromNodeId);
      ensureNode(graphEdge.toNodeId);

      // Forward
      addEdge(graphEdge.fromNodeId, {
        graphEdgeId: edgeId,
        corridorId: connector.id,
        kind: "connector",
        targetNodeId: graphEdge.toNodeId,
        lengthMeters: graphEdge.attributes.lengthMeters,
        score
      });

      // Reverse
      addEdge(graphEdge.toNodeId, {
        graphEdgeId: edgeId,
        corridorId: connector.id,
        kind: "connector",
        targetNodeId: graphEdge.fromNodeId,
        lengthMeters: graphEdge.attributes.lengthMeters,
        score
      });
    }
  }

  // Connectivity diagnostics
  let totalEdges = 0;
  let maxDegree = 0;
  const degreeHist: Record<number, number> = {};
  for (const edges of adjacency.values()) {
    totalEdges += edges.length;
    if (edges.length > maxDegree) maxDegree = edges.length;
    const bucket = Math.min(edges.length, 10);
    degreeHist[bucket] = (degreeHist[bucket] ?? 0) + 1;
  }

  console.log(
    `[search-graph] ${nodeCoordinates.size} nodes, ${totalEdges} edges, ${skippedCorridors} corridors skipped (type/surface/road-class), ${skippedConnectors} connectors skipped (no 2+ included corridors), ${skippedConnectorEdges} connector edges skipped (road-class), ${missingEdges} missing edge lookups, ${missingNodes} missing node lookups, max degree=${maxDegree}`
  );
  console.log(
    `[search-graph] Degree distribution: ${Object.entries(degreeHist)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(" ")}`
  );

  return { adjacency, nodeCoordinates };
}
