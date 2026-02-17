/**
 * Corridor construction module.
 *
 * Responsible for deriving corridors from the raw graph. A corridor
 * is a continuous stretch of road/path with relatively uniform character.
 *
 * Graph -> Analyze edges -> Cluster similar contiguous edges -> Corridors
 */

import type { Graph } from "../domain/index.js";
import type {
  Corridor,
  CorridorNetwork,
  CorridorType,
  Connector,
  ConnectorAttributes,
} from "../domain/corridor.js";
import type { ActivityType } from "../domain/intent.js";
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
import { scoreCorridors } from "./scoring.js";

/** Options for corridor construction */
export interface CorridorBuilderOptions {
  /** Minimum corridor length in meters (shorter stretches become connectors) */
  minLengthMeters?: number;
  /** Maximum speed limit difference to merge edges (km/h) */
  maxSpeedDifference?: number;
  /** Whether to allow merging across minor name changes */
  allowNameChanges?: boolean;
  /** Maximum angle change at intersections to continue a corridor (degrees) */
  maxAngleChange?: number;
}

/** Default options for corridor building */
export const DEFAULT_CORRIDOR_OPTIONS: Required<CorridorBuilderOptions> = {
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
    if (chain.totalLengthMeters >= opts.minLengthMeters) {
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

  // Step 6: Score corridors for all activity types
  const activityTypes: ActivityType[] = ["road-cycling", "gravel-cycling", "running", "walking"];
  for (const activity of activityTypes) {
    scoreCorridors(corridors, activity);
  }

  // Step 7: Compute stats
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
 * - quiet-road: residential/unclassified/service, speed <= 40 or unknown
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

  // Quiet road: residential/unclassified/service with low speed
  if (
    predominantRoadClass === "residential" ||
    predominantRoadClass === "unclassified" ||
    predominantRoadClass === "service"
  ) {
    if (averageSpeedLimit == null || averageSpeedLimit <= 40) {
      return "quiet-road";
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

  for (const edgeId of edgeIds) {
    const edge = graph.edges.get(edgeId)!;
    totalLength += edge.attributes.lengthMeters;
    if (MAJOR_ROAD_CLASSES.has(edge.attributes.roadClass)) {
      crossesMajorRoad = true;
    }
  }

  return {
    lengthMeters: totalLength,
    crossesMajorRoad,
    hasSignal: false,
    hasStop: false,
    crossingDifficulty: crossesMajorRoad ? 0.5 : 0.1,
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
} from "./corridor-attributes.js";
export {
  scoreFlow,
  scoreSafety,
  scoreSurface,
  scoreCharacter,
  scoreCorridor,
  scoreCorridors,
  DEFAULT_SCORING_WEIGHTS,
} from "./scoring.js";
export type { ScoringWeights } from "./scoring.js";
