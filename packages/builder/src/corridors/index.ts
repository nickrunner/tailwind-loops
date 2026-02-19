/**
 * Corridor construction module.
 *
 * Responsible for deriving corridors from the raw graph. A corridor
 * is a continuous stretch of road/path with relatively uniform character.
 *
 * Graph -> Analyze edges -> Cluster similar contiguous edges -> Corridors
 */

import type {
  Graph,
  Corridor,
  CorridorNetwork,
  CorridorType,
  Connector,
  ConnectorAttributes,
} from "@tailwind-loops/types";
import {
  buildChains,
  computeUndirectedDegree,
  trimDeadEnds,
} from "./chain-builder.js";
import {
  aggregateAttributes,
  deriveName,
  buildCorridorGeometry,
} from "./corridor-attributes.js";
import {
  getEffectiveMinLength,
  type MinLengthByTier,
} from "./chain-classification.js";

/** Options for corridor construction */
export interface CorridorBuilderOptions {
  /** Minimum corridor length in meters (shorter stretches become connectors).
   *  Used as the "unnamed" tier fallback when minLengthByTier is not provided. */
  minLengthMeters?: number;
  /** Per-tier minimum length overrides for smarter corridor detection.
   *  When provided, chain classification uses infrastructure-aware thresholds. */
  minLengthByTier?: MinLengthByTier;
  /** Maximum speed limit difference to merge edges (km/h) */
  maxSpeedDifference?: number;
  /** Whether to allow merging across minor name changes */
  allowNameChanges?: boolean;
  /** Maximum angle change at intersections to continue a corridor (degrees) */
  maxAngleChange?: number;
}

/** Default options for corridor building */
export const DEFAULT_CORRIDOR_OPTIONS: Required<Omit<CorridorBuilderOptions, "minLengthByTier">> & Pick<CorridorBuilderOptions, "minLengthByTier"> = {
  minLengthMeters: 1609, // ~1 mile
  maxSpeedDifference: 15,
  allowNameChanges: true,
  maxAngleChange: 45,
};

/** Result of corridor construction */
export interface CorridorBuildResult {
  network: CorridorNetwork;
  /** Statistics about the construction */
  stats: {
    corridorCount: number;
    connectorCount: number;
    averageLengthMeters: number;
    totalLengthMeters: number;
    buildTimeMs: number;
  };
}

/** Major road classes used to determine connector crossesMajorRoad */
const MAJOR_ROAD_CLASSES = new Set(["primary", "secondary", "trunk"]);

/**
 * Build corridors from a graph.
 *
 * Pipeline:
 * 1. Build edge chains from graph
 * 2. Separate chains by length threshold into corridor vs connector candidates
 * 3. Build full Corridor objects from long chains
 * 4. Build Connector objects from short chains
 * 5. Compute adjacency between corridors and connectors at shared nodes
 *
 * @param graph - The input graph
 * @param options - Builder options
 * @returns The corridor network and statistics
 */
export async function buildCorridors(
  graph: Graph,
  options?: CorridorBuilderOptions
): Promise<CorridorBuildResult> {
  const startTime = performance.now();
  const opts = { ...DEFAULT_CORRIDOR_OPTIONS, ...options };

  // Step 1: Build edge chains
  const rawChains = buildChains(graph, opts);

  // Step 1b: Iteratively trim dead-end edges from chain endpoints.
  // Each pass: compute degree from surviving chain edges, trim, repeat.
  // Discarding a dead-end chain (e.g. a service road) may expose new dead ends
  // on adjacent chains, so we iterate until stable.
  let chains = rawChains;
  let prevEdgeCount = -1;
  while (true) {
    const totalEdges = chains.reduce((s, c) => s + c.edgeIds.length, 0);
    if (totalEdges === prevEdgeCount) break;
    prevEdgeCount = totalEdges;
    const nodeDegree = computeUndirectedDegree(chains, graph);
    chains = trimDeadEnds(chains, graph, nodeDegree);
  }

  // Step 2: Separate by length threshold
  const corridors = new Map<string, Corridor>();
  const connectors = new Map<string, Connector>();

  // Track node → corridor/connector IDs for adjacency.
  // We register ALL graph nodes touched by each entity (not just chain endpoints)
  // because connectors may attach at intermediate nodes of a corridor.
  const nodeToEntityIds = new Map<string, string[]>();

  function registerNode(nodeId: string, entityId: string) {
    const list = nodeToEntityIds.get(nodeId);
    if (list) {
      if (!list.includes(entityId)) list.push(entityId);
    } else {
      nodeToEntityIds.set(nodeId, [entityId]);
    }
  }

  function registerAllNodes(edgeIds: string[], entityId: string) {
    for (const edgeId of edgeIds) {
      const edge = graph.edges.get(edgeId)!;
      registerNode(edge.fromNodeId, entityId);
      registerNode(edge.toNodeId, entityId);
    }
  }

  let corridorIdx = 0;
  let connectorIdx = 0;

  for (const chain of chains) {
    const effectiveMinLength = getEffectiveMinLength(chain, graph, opts);
    if (chain.totalLengthMeters >= effectiveMinLength) {
      // Step 3: Build Corridor
      const id = `corridor-${corridorIdx++}`;
      const attributes = aggregateAttributes(chain.edgeIds, graph);
      const name = deriveName(chain.edgeIds, graph);
      const geometry = buildCorridorGeometry(chain.edgeIds, graph);
      const type = classifyCorridor({
        id,
        name,
        type: "mixed", // placeholder, will be replaced
        attributes,
        edgeIds: chain.edgeIds,
        startNodeId: chain.startNodeId,
        endNodeId: chain.endNodeId,
        geometry,
        oneWay: false, // placeholder
      });

      // Determine directionality: corridor is one-way if its edges are one-way
      const firstEdge = graph.edges.get(chain.edgeIds[0]!);
      const isOneWay = firstEdge?.attributes.oneWay ?? false;

      const corridor: Corridor = {
        id,
        name,
        type,
        attributes,
        edgeIds: chain.edgeIds,
        startNodeId: chain.startNodeId,
        endNodeId: chain.endNodeId,
        geometry,
        oneWay: isOneWay,
      };

      corridors.set(id, corridor);
      registerAllNodes(chain.edgeIds, id);
    } else {
      // Step 4: Build Connector
      const id = `connector-${connectorIdx++}`;
      const connectorAttrs = buildConnectorAttributes(chain.edgeIds, graph);
      const geometry = buildCorridorGeometry(chain.edgeIds, graph);

      const connector: Connector = {
        id,
        edgeIds: chain.edgeIds,
        corridorIds: [], // filled in during adjacency pass
        startNodeId: chain.startNodeId,
        endNodeId: chain.endNodeId,
        attributes: connectorAttrs,
        geometry,
      };

      connectors.set(id, connector);
      registerAllNodes(chain.edgeIds, id);
    }
  }

  // Step 5: Build adjacency graph
  const adjacency = new Map<string, string[]>();

  for (const entityIds of nodeToEntityIds.values()) {
    if (entityIds.length < 2) continue;

    // All entities sharing this node are adjacent to each other
    for (const a of entityIds) {
      for (const b of entityIds) {
        if (a === b) continue;
        let adjList = adjacency.get(a);
        if (!adjList) {
          adjList = [];
          adjacency.set(a, adjList);
        }
        if (!adjList.includes(b)) {
          adjList.push(b);
        }
      }
    }
  }

  // Fill in corridorIds on connectors
  for (const connector of connectors.values()) {
    const adjIds = adjacency.get(connector.id) ?? [];
    connector.corridorIds = adjIds.filter((id) => corridors.has(id));
  }

  // Step 5b: Sanitize connectors — only keep connectors that bridge 2+ distinct corridors.
  // Connectors that loop within neighborhoods or dead-end into a single corridor
  // don't serve routing and create noise.
  const removedConnectorIds = new Set<string>();
  for (const connector of connectors.values()) {
    const uniqueCorridorIds = new Set(connector.corridorIds);
    if (uniqueCorridorIds.size < 2) {
      removedConnectorIds.add(connector.id);
      connectors.delete(connector.id);
      adjacency.delete(connector.id);
    }
  }

  // Clean up adjacency lists: remove references to deleted connectors
  if (removedConnectorIds.size > 0) {
    for (const [entityId, adjList] of adjacency) {
      const filtered = adjList.filter((id) => !removedConnectorIds.has(id));
      if (filtered.length > 0) {
        adjacency.set(entityId, filtered);
      } else {
        adjacency.delete(entityId);
      }
    }
  }

  // Step 6: Compute stats
  let totalLength = 0;
  for (const c of corridors.values()) {
    totalLength += c.attributes.lengthMeters;
  }

  const buildTimeMs = performance.now() - startTime;

  return {
    network: { corridors, connectors, adjacency },
    stats: {
      corridorCount: corridors.size,
      connectorCount: connectors.size,
      averageLengthMeters:
        corridors.size > 0 ? totalLength / corridors.size : 0,
      totalLengthMeters: totalLength,
      buildTimeMs,
    },
  };
}

/**
 * Classify a corridor based on its attributes.
 *
 * Classification rules:
 * - trail: cycleway/path road class + separation continuity > 0.7
 * - path: footway/path road class, shorter or not separated
 * - neighborhood: residential/unclassified/service, speed <= 40, with urban signals
 * - rural-road: residential/unclassified/service, speed <= 40, without urban signals
 * - collector: secondary/tertiary
 * - arterial: primary/trunk/motorway
 * - mixed: none of the above clearly match
 */
export function classifyCorridor(corridor: Corridor): CorridorType {
  const { predominantRoadClass, separationContinuity, averageSpeedLimit } =
    corridor.attributes;

  // Trail: dedicated cycling/walking path, well separated
  if (
    (predominantRoadClass === "cycleway" ||
      predominantRoadClass === "path") &&
    separationContinuity > 0.7
  ) {
    return "trail";
  }

  // Path: footway/path but not a trail (shorter or less separated)
  if (
    predominantRoadClass === "footway" ||
    predominantRoadClass === "path"
  ) {
    return "path";
  }

  // Arterial: major roads
  if (
    predominantRoadClass === "primary" ||
    predominantRoadClass === "trunk" ||
    predominantRoadClass === "motorway"
  ) {
    return "arterial";
  }

  // Collector: medium roads
  if (
    predominantRoadClass === "secondary" ||
    predominantRoadClass === "tertiary"
  ) {
    return "collector";
  }

  // Neighborhood vs rural road: residential/unclassified/service with low speed
  if (
    predominantRoadClass === "residential" ||
    predominantRoadClass === "unclassified" ||
    predominantRoadClass === "service"
  ) {
    if (averageSpeedLimit == null || averageSpeedLimit <= 40) {
      const { crossingDensityPerKm, stopDensityPerKm, pedestrianPathContinuity, trafficCalmingContinuity } =
        corridor.attributes;
      // crossingDensityPerKm is topology-based (always reliable) —
      // neighborhood grids have ~5-10 intersections/km, rural roads ~1-3
      const isRural =
        crossingDensityPerKm < 4 &&
        stopDensityPerKm < 2 &&
        pedestrianPathContinuity < 0.3 &&
        trafficCalmingContinuity < 0.3;
      return isRural ? "rural-road" : "neighborhood";
    }
  }

  return "mixed";
}

/**
 * Build connector attributes from edge data.
 */
function buildConnectorAttributes(
  edgeIds: string[],
  graph: Graph
): ConnectorAttributes {
  let totalLength = 0;
  let crossesMajorRoad = false;
  let hasSignal = false;
  let hasStop = false;

  for (const edgeId of edgeIds) {
    const edge = graph.edges.get(edgeId)!;
    totalLength += edge.attributes.lengthMeters;
    if (MAJOR_ROAD_CLASSES.has(edge.attributes.roadClass)) {
      crossesMajorRoad = true;
    }
    // Use edge-level counts (includes intermediate OSM nodes)
    if ((edge.attributes.trafficSignalCount ?? 0) > 0) hasSignal = true;
    if ((edge.attributes.stopSignCount ?? 0) > 0) hasStop = true;
    if ((edge.attributes.roadCrossingCount ?? 0) > 0) hasStop = true;
  }

  // Also check endpoint graph nodes (they carry tags from the split-point OSM nodes)
  if (edgeIds.length > 0) {
    const firstEdge = graph.edges.get(edgeIds[0]!)!;
    const lastEdge = graph.edges.get(edgeIds[edgeIds.length - 1]!)!;
    const startNode = graph.nodes.get(firstEdge.fromNodeId);
    const endNode = graph.nodes.get(lastEdge.toNodeId);
    if (startNode?.hasSignal || endNode?.hasSignal) hasSignal = true;
    if (startNode?.hasStop || endNode?.hasStop) hasStop = true;
    if (startNode?.isCrossing || endNode?.isCrossing) hasStop = true;
  }

  // Crossing difficulty factors in signals/stops
  let crossingDifficulty = 0.1;
  if (crossesMajorRoad) crossingDifficulty = hasSignal ? 0.3 : 0.7;
  else if (hasStop) crossingDifficulty = 0.2;
  else if (hasSignal) crossingDifficulty = 0.15;

  return {
    lengthMeters: totalLength,
    crossesMajorRoad,
    hasSignal,
    hasStop,
    crossingDifficulty,
  };
}

export { edgeCompatibility } from "./edge-compatibility.js";
export {
  buildChains,
  getCounterpartEdgeId,
  computeUndirectedDegree,
  trimDeadEnds,
} from "./chain-builder.js";
export type { EdgeChain } from "./chain-builder.js";
export {
  aggregateAttributes,
  deriveName,
  buildCorridorGeometry,
  douglasPeucker,
  nameConsistency,
} from "./corridor-attributes.js";
export {
  getEffectiveMinLength,
  chainHomogeneity,
} from "./chain-classification.js";
export type { MinLengthByTier } from "./chain-classification.js";
