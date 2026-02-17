/**
 * Build a Graph from OSM elements.
 *
 * Converts OSM nodes and ways into our domain Graph structure,
 * handling edge splitting at intersections and bidirectional edges.
 */

import type {
  Coordinate,
  EdgeAttributes,
  Graph,
  GraphEdge,
  GraphNode,
  SurfaceClassification,
} from "../../domain/index.js";
import { fuseSurfaceObservations } from "../index.js";
import type { OsmNode, OsmWay } from "./types.js";
import {
  extractInfrastructure,
  extractLanes,
  extractName,
  extractOneWay,
  extractRoadClass,
  extractSpeedLimit,
  extractSurface,
  isReverseOneWay,
} from "./tag-extractors.js";

/**
 * Statistics about the graph building process.
 */
export interface GraphBuildStats {
  /** Number of nodes in the graph */
  nodesCount: number;
  /** Number of edges in the graph */
  edgesCount: number;
  /** Total length of all edges in meters */
  totalLengthMeters: number;
  /** Time taken to build the graph in milliseconds */
  buildTimeMs: number;
  /** Number of OSM ways processed */
  waysProcessed: number;
  /** Number of one-way edges created */
  oneWayEdges: number;
  /** Number of bidirectional edge pairs created */
  bidirectionalEdgePairs: number;
}

/**
 * Result of building a graph from OSM elements.
 */
export interface GraphBuildResult {
  graph: Graph;
  stats: GraphBuildStats;
}

/**
 * Build a Graph from an async iterable of OSM elements.
 *
 * Algorithm:
 * 1. Collect all nodes into a map
 * 2. Collect all ways
 * 3. Find intersection nodes (referenced by multiple ways)
 * 4. For each way, create edges between consecutive nodes
 * 5. Build adjacency list
 *
 * @param elements - Async iterable of OSM nodes and ways
 * @returns Graph and build statistics
 */
export async function buildGraphFromOsm(
  elements: AsyncIterable<OsmNode | OsmWay>
): Promise<GraphBuildResult> {
  const startTime = Date.now();

  // Collect nodes and ways
  const osmNodes = new Map<number, OsmNode>();
  const osmWays: OsmWay[] = [];

  for await (const element of elements) {
    if (element.type === "node") {
      osmNodes.set(element.id, element);
    } else if (element.type === "way") {
      osmWays.push(element);
    }
  }

  // Count node references to find intersections
  const nodeRefCounts = new Map<number, number>();
  for (const way of osmWays) {
    for (const nodeId of way.refs) {
      nodeRefCounts.set(nodeId, (nodeRefCounts.get(nodeId) ?? 0) + 1);
    }
  }

  // Detect implicit road crossings: nodes shared between trail/path/cycleway
  // ways and road ways. When a trail crosses a road, the cyclist must stop
  // even if there's no explicit highway=stop or highway=crossing tag.
  // Only count implicit crossings for dedicated cycling/trail infrastructure.
  // Exclude footway/pedestrian (often sidewalks that touch every cross-street).
  const TRAIL_HIGHWAYS = new Set(["cycleway", "path", "bridleway", "track"]);
  const ROAD_HIGHWAYS = new Set([
    "primary", "primary_link", "secondary", "secondary_link",
    "tertiary", "tertiary_link", "unclassified", "residential",
    "living_street", "service",
  ]);

  const trailNodes = new Set<number>();
  const roadNodes = new Set<number>();
  for (const way of osmWays) {
    const hw = way.tags?.["highway"];
    if (hw && TRAIL_HIGHWAYS.has(hw)) {
      for (const nodeId of way.refs) trailNodes.add(nodeId);
    }
    if (hw && ROAD_HIGHWAYS.has(hw)) {
      for (const nodeId of way.refs) roadNodes.add(nodeId);
    }
  }
  // Nodes where a trail/cycleway intersects a road
  const implicitCrossingNodes = new Set<number>();
  for (const nodeId of trailNodes) {
    if (roadNodes.has(nodeId)) implicitCrossingNodes.add(nodeId);
  }

  // Build graph structures
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const adjacency = new Map<string, string[]>();

  let totalLengthMeters = 0;
  let oneWayEdges = 0;
  let bidirectionalEdgePairs = 0;

  // Process each way
  for (const way of osmWays) {
    const roadClass = extractRoadClass(way.tags);
    const surfaceObs = extractSurface(way.tags, roadClass);
    const surfaceClassification = fuseSurfaceObservations([surfaceObs]);
    const infrastructure = extractInfrastructure(way.tags);
    const isOneWay = extractOneWay(way.tags);
    const isReverse = isReverseOneWay(way.tags);
    const speedLimit = extractSpeedLimit(way.tags);
    const lanes = extractLanes(way.tags);
    const name = extractName(way.tags);
    const isTrailWay = TRAIL_HIGHWAYS.has(way.tags?.["highway"] ?? "");

    // Get coordinates for all nodes in the way
    const wayCoords: { nodeId: number; coord: Coordinate }[] = [];
    for (const nodeId of way.refs) {
      const osmNode = osmNodes.get(nodeId);
      if (osmNode) {
        wayCoords.push({
          nodeId,
          coord: { lat: osmNode.lat, lng: osmNode.lon },
        });
      }
    }

    if (wayCoords.length < 2) continue;

    // Find split points (intersections and way endpoints)
    const splitIndices: number[] = [0];
    for (let i = 1; i < wayCoords.length - 1; i++) {
      const nodeId = wayCoords[i]!.nodeId;
      const refCount = nodeRefCounts.get(nodeId) ?? 0;
      // Split at intersections (nodes used by multiple ways)
      if (refCount > 1) {
        splitIndices.push(i);
      }
    }
    splitIndices.push(wayCoords.length - 1);

    // Create edges between split points
    for (let i = 0; i < splitIndices.length - 1; i++) {
      const startIdx = splitIndices[i]!;
      const endIdx = splitIndices[i + 1]!;

      const startWayCoord = wayCoords[startIdx]!;
      const endWayCoord = wayCoords[endIdx]!;

      // Build geometry for this segment and count stops/signals/crossings on all nodes
      const geometry: Coordinate[] = [];
      let stopSignCount = 0;
      let trafficSignalCount = 0;
      let roadCrossingCount = 0;
      for (let j = startIdx; j <= endIdx; j++) {
        geometry.push(wayCoords[j]!.coord);
        const osmNodeId = wayCoords[j]!.nodeId;
        const nodeOsm = osmNodes.get(osmNodeId);
        const hw = nodeOsm?.tags?.["highway"];
        if (hw === "stop") stopSignCount++;
        else if (hw === "traffic_signals") trafficSignalCount++;
        // Road crossings only matter on trail/cycleway edges — a cyclist
        // on a trail must stop at road crossings; a car on a road does not.
        else if (isTrailWay && hw === "crossing") roadCrossingCount++;
        else if (isTrailWay && j !== startIdx && j !== endIdx
          && implicitCrossingNodes.has(osmNodeId)) roadCrossingCount++;
      }

      // Calculate length
      const lengthMeters = calculatePathLength(geometry);
      totalLengthMeters += lengthMeters;

      // Create/get graph nodes
      const fromNodeId = String(startWayCoord.nodeId);
      const toNodeId = String(endWayCoord.nodeId);

      if (!nodes.has(fromNodeId)) {
        const fromOsmNode = osmNodes.get(startWayCoord.nodeId);
        const fromHighway = fromOsmNode?.tags?.["highway"];
        nodes.set(fromNodeId, {
          id: fromNodeId,
          coordinate: startWayCoord.coord,
          osmId: String(startWayCoord.nodeId),
          ...(fromHighway === "stop" && { hasStop: true }),
          ...(fromHighway === "traffic_signals" && { hasSignal: true }),
          ...((fromHighway === "crossing" || (isTrailWay && implicitCrossingNodes.has(startWayCoord.nodeId))) && { isCrossing: true }),
        });
      }
      if (!nodes.has(toNodeId)) {
        const toOsmNode = osmNodes.get(endWayCoord.nodeId);
        const toHighway = toOsmNode?.tags?.["highway"];
        nodes.set(toNodeId, {
          id: toNodeId,
          coordinate: endWayCoord.coord,
          osmId: String(endWayCoord.nodeId),
          ...(toHighway === "stop" && { hasStop: true }),
          ...(toHighway === "traffic_signals" && { hasSignal: true }),
          ...((toHighway === "crossing" || (isTrailWay && implicitCrossingNodes.has(endWayCoord.nodeId))) && { isCrossing: true }),
        });
      }

      // Build edge attributes
      const attributes: EdgeAttributes = {
        roadClass,
        surfaceClassification,
        infrastructure,
        oneWay: isOneWay,
        lengthMeters,
        lanes,
        speedLimit,
        name,
        ...(stopSignCount > 0 && { stopSignCount }),
        ...(trafficSignalCount > 0 && { trafficSignalCount }),
        ...(roadCrossingCount > 0 && { roadCrossingCount }),
      };

      // Create edge(s)
      if (isOneWay) {
        // One-way: single edge in direction of travel
        const edgeId = `${way.id}:${startIdx}`;
        const [actualFrom, actualTo, actualGeom] = isReverse
          ? [toNodeId, fromNodeId, [...geometry].reverse()]
          : [fromNodeId, toNodeId, geometry];

        const edge: GraphEdge = {
          id: edgeId,
          fromNodeId: actualFrom,
          toNodeId: actualTo,
          attributes,
          osmWayId: String(way.id),
          geometry: actualGeom,
        };

        edges.set(edgeId, edge);
        addToAdjacency(adjacency, actualFrom, edgeId);
        oneWayEdges++;
      } else {
        // Bidirectional: create edges in both directions
        const forwardId = `${way.id}:${startIdx}:f`;
        const reverseId = `${way.id}:${startIdx}:r`;

        const forwardEdge: GraphEdge = {
          id: forwardId,
          fromNodeId,
          toNodeId,
          attributes,
          osmWayId: String(way.id),
          geometry,
        };

        const reverseEdge: GraphEdge = {
          id: reverseId,
          fromNodeId: toNodeId,
          toNodeId: fromNodeId,
          attributes,
          osmWayId: String(way.id),
          geometry: [...geometry].reverse(),
        };

        edges.set(forwardId, forwardEdge);
        edges.set(reverseId, reverseEdge);
        addToAdjacency(adjacency, fromNodeId, forwardId);
        addToAdjacency(adjacency, toNodeId, reverseId);
        bidirectionalEdgePairs++;
      }
    }
  }

  const buildTimeMs = Date.now() - startTime;

  return {
    graph: { nodes, edges, adjacency },
    stats: {
      nodesCount: nodes.size,
      edgesCount: edges.size,
      totalLengthMeters,
      buildTimeMs,
      waysProcessed: osmWays.length,
      oneWayEdges,
      bidirectionalEdgePairs,
    },
  };
}

/**
 * Add an edge ID to the adjacency list for a node.
 */
function addToAdjacency(
  adjacency: Map<string, string[]>,
  nodeId: string,
  edgeId: string
): void {
  const existing = adjacency.get(nodeId);
  if (existing) {
    existing.push(edgeId);
  } else {
    adjacency.set(nodeId, [edgeId]);
  }
}

/**
 * Calculate the total length of a path in meters using Haversine formula.
 */
export function calculatePathLength(coords: Coordinate[]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistance(coords[i]!, coords[i + 1]!);
  }
  return total;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 *
 * @param a - First coordinate
 * @param b - Second coordinate
 * @returns Distance in meters
 */
export function haversineDistance(a: Coordinate, b: Coordinate): number {
  const R = 6371000; // Earth's radius in meters

  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * R * Math.asin(Math.sqrt(h));
}
