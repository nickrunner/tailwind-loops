import { describe, it, expect } from "vitest";
import { buildSearchGraph } from "./search-graph.js";
import type {
  CorridorNetwork,
  Graph,
  Corridor,
  Connector,
  GraphNode,
  GraphEdge,
  ActivityType,
  CorridorAttributes,
  SurfaceClassification,
  Infrastructure,
} from "@tailwind-loops/types";

function makeNode(id: string, lat: number, lng: number): GraphNode {
  return { id, coordinate: { lat, lng } };
}

const DEFAULT_SURFACE: SurfaceClassification = {
  surface: "paved",
  confidence: 1,
  hasConflict: false,
};

const DEFAULT_INFRA: Infrastructure = {
  hasBicycleInfra: false,
  hasPedestrianPath: false,
  hasShoulder: false,
  isSeparated: false,
  hasTrafficCalming: false,
};

function makeEdge(id: string, from: string, to: string, length: number): GraphEdge {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    attributes: {
      roadClass: "residential",
      surfaceClassification: DEFAULT_SURFACE,
      infrastructure: DEFAULT_INFRA,
      oneWay: false,
      lengthMeters: length,
    },
    geometry: [
      { lat: 42.96, lng: -85.66 },
      { lat: 42.97, lng: -85.66 },
    ],
  };
}

function makeCorridorAttrs(length: number): CorridorAttributes {
  return {
    lengthMeters: length,
    predominantRoadClass: "residential",
    predominantSurface: "paved",
    surfaceConfidence: 1,
    stopDensityPerKm: 0,
    crossingDensityPerKm: 0,
    bicycleInfraContinuity: 0,
    pedestrianPathContinuity: 0,
    separationContinuity: 0,
    turnsCount: 0,
    trafficCalmingContinuity: 0,
    scenicScore: 0,
  };
}

function makeCorridor(id: string, start: string, end: string, edgeIds: string[], length: number, oneWay = false): Corridor {
  return {
    id,
    type: "neighborhood",
    attributes: makeCorridorAttrs(length),
    edgeIds,
    startNodeId: start,
    endNodeId: end,
    geometry: [],
    oneWay,
    scores: {
      "road-cycling": { overall: 0.8, flow: 0.8, safety: 0.8, surface: 0.8, character: 0.8, scenic: 0.5, elevation: 0.5 },
    },
  };
}

function makeConnector(id: string, start: string, end: string, edgeIds: string[], length: number, difficulty = 0.2): Connector {
  return {
    id,
    edgeIds,
    corridorIds: [],
    startNodeId: start,
    endNodeId: end,
    attributes: {
      lengthMeters: length,
      crossesMajorRoad: false,
      hasSignal: false,
      hasStop: false,
      crossingDifficulty: difficulty,
    },
    geometry: [],
  };
}

function makeGraph(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(edges.map((e) => [e.id, e]));
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    let list = adjacency.get(edge.fromNodeId);
    if (!list) { list = []; adjacency.set(edge.fromNodeId, list); }
    list.push(edge.id);
  }
  return { nodes: nodeMap, edges: edgeMap, adjacency };
}

describe("buildSearchGraph", () => {
  const activity: ActivityType = "road-cycling";

  it("builds adjacency from individual graph edges within corridors", () => {
    // Corridor c1: A→M→B, Corridor c2: C→D, Connector conn1 bridges B→C
    const nodes = [
      makeNode("A", 42.96, -85.66),
      makeNode("M", 42.965, -85.66),
      makeNode("B", 42.97, -85.66),
      makeNode("C", 42.97, -85.65),
      makeNode("D", 42.97, -85.64),
    ];
    const edges = [
      makeEdge("e1", "A", "M", 500),
      makeEdge("e2", "M", "B", 500),
      makeEdge("e3", "B", "C", 500),
      makeEdge("e4", "C", "D", 500),
    ];
    const graph = makeGraph(nodes, edges);

    const corridors = new Map<string, Corridor>([
      ["c1", makeCorridor("c1", "A", "B", ["e1", "e2"], 1000)],
      ["c2", makeCorridor("c2", "C", "D", ["e4"], 500)],
    ]);
    const conn1 = makeConnector("conn1", "B", "C", ["e3"], 500);
    conn1.corridorIds = ["c1", "c2"];
    const connectors = new Map<string, Connector>([
      ["conn1", conn1],
    ]);

    const network: CorridorNetwork = {
      corridors,
      connectors,
      adjacency: new Map(),
    };

    const sg = buildSearchGraph(network, graph, activity);

    // All 5 nodes should have coordinates
    expect(sg.nodeCoordinates.size).toBe(5);

    // Node A: forward through e1 → M
    const aEdges = sg.adjacency.get("A") ?? [];
    expect(aEdges.some((e) => e.targetNodeId === "M" && e.graphEdgeId === "e1")).toBe(true);

    // Node M: forward through e2 → B, and reverse through e1 → A
    const mEdges = sg.adjacency.get("M") ?? [];
    expect(mEdges.some((e) => e.targetNodeId === "B" && e.graphEdgeId === "e2")).toBe(true);
    expect(mEdges.some((e) => e.targetNodeId === "A" && e.graphEdgeId === "e1")).toBe(true);

    // Node B: reverse through e2 → M, and connector e3 → C
    const bEdges = sg.adjacency.get("B") ?? [];
    expect(bEdges.some((e) => e.targetNodeId === "M")).toBe(true);
    expect(bEdges.some((e) => e.targetNodeId === "C")).toBe(true);
  });

  it("handles one-way corridors (single direction only)", () => {
    const nodes = [
      makeNode("A", 42.96, -85.66),
      makeNode("B", 42.97, -85.66),
    ];
    const edges = [makeEdge("e1", "A", "B", 1000)];
    const graph = makeGraph(nodes, edges);

    const corridors = new Map<string, Corridor>([
      ["c1", makeCorridor("c1", "A", "B", ["e1"], 1000, true)],
    ]);

    const network: CorridorNetwork = {
      corridors,
      connectors: new Map(),
      adjacency: new Map(),
    };

    const sg = buildSearchGraph(network, graph, activity);

    // A → B exists
    const aEdges = sg.adjacency.get("A") ?? [];
    expect(aEdges.some((e) => e.targetNodeId === "B")).toBe(true);

    // B → A should NOT exist (one-way)
    const bEdges = sg.adjacency.get("B") ?? [];
    expect(bEdges.some((e) => e.targetNodeId === "A")).toBe(false);
  });

  it("connectors are always bidirectional", () => {
    // Two corridors (c1: X→A, c2: B→Y) bridged by connector conn1: A→B
    const nodes = [
      makeNode("X", 42.95, -85.66),
      makeNode("A", 42.96, -85.66),
      makeNode("B", 42.97, -85.66),
      makeNode("Y", 42.98, -85.66),
    ];
    const edges = [
      makeEdge("ec1", "X", "A", 500),
      makeEdge("e1", "A", "B", 200),
      makeEdge("ec2", "B", "Y", 500),
    ];
    const graph = makeGraph(nodes, edges);

    const conn1 = makeConnector("conn1", "A", "B", ["e1"], 200, 0.3);
    conn1.corridorIds = ["c1", "c2"];

    const network: CorridorNetwork = {
      corridors: new Map<string, Corridor>([
        ["c1", makeCorridor("c1", "X", "A", ["ec1"], 500)],
        ["c2", makeCorridor("c2", "B", "Y", ["ec2"], 500)],
      ]),
      connectors: new Map<string, Connector>([
        ["conn1", conn1],
      ]),
      adjacency: new Map(),
    };

    const sg = buildSearchGraph(network, graph, activity);

    const aEdges = sg.adjacency.get("A") ?? [];
    const bEdges = sg.adjacency.get("B") ?? [];

    expect(aEdges.some((e) => e.targetNodeId === "B")).toBe(true);
    expect(bEdges.some((e) => e.targetNodeId === "A")).toBe(true);

    // Connector score = 1 - crossingDifficulty
    const connEdge = aEdges.find((e) => e.corridorId === "conn1");
    expect(connEdge?.score).toBeCloseTo(0.7);
  });
});
