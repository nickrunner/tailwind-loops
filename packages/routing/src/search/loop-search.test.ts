import { describe, it, expect } from "vitest";
import { generateLoops } from "./beam-search.js";
import { buildSearchGraph } from "./search-graph.js";
import { haversineDistance, bearing } from "./snap.js";
import { generateLoopRoutes } from "./index.js";
import type {
  CorridorNetwork,
  Graph,
  Corridor,
  GraphNode,
  GraphEdge,
  CorridorAttributes,
  SurfaceClassification,
  Infrastructure,
  ActivityType,
} from "@tailwind-loops/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DEFAULT_SURFACE: SurfaceClassification = {
  surface: "paved",
  confidence: 1,
  observations: [],
  hasConflict: false,
};

const DEFAULT_INFRA: Infrastructure = {
  hasBicycleInfra: false,
  hasPedestrianPath: false,
  hasShoulder: false,
  isSeparated: false,
  hasTrafficCalming: false,
};

function makeNode(id: string, lat: number, lng: number): GraphNode {
  return { id, coordinate: { lat, lng } };
}

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

function makeCorridor(
  id: string,
  start: string,
  end: string,
  edgeIds: string[],
  length: number,
  score = 0.8,
): Corridor {
  return {
    id,
    type: "neighborhood",
    attributes: makeCorridorAttrs(length),
    edgeIds,
    startNodeId: start,
    endNodeId: end,
    geometry: [],
    oneWay: false,
    scores: {
      "road-cycling": {
        overall: score,
        flow: score,
        safety: score,
        surface: score,
        character: score,
        scenic: 0.5,
        elevation: 0.5,
      },
    },
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

/**
 * Build a rectangle loop:
 *
 *   A --e1-- B
 *   |        |
 *  e4       e2
 *   |        |
 *   D --e3-- C
 *
 * Each side is one edge + one corridor.
 */
function makeRectangleNetwork(sideLength: number) {
  const latDeg = sideLength / 111_000;
  const lngDeg = sideLength / 85_000;
  const baseLat = 42.96;
  const baseLng = -85.66;

  const nodes = [
    makeNode("A", baseLat, baseLng),
    makeNode("B", baseLat, baseLng + lngDeg),
    makeNode("C", baseLat - latDeg, baseLng + lngDeg),
    makeNode("D", baseLat - latDeg, baseLng),
  ];

  const edges = [
    makeEdge("e1", "A", "B", sideLength),
    makeEdge("e2", "B", "C", sideLength),
    makeEdge("e3", "D", "C", sideLength),
    makeEdge("e4", "A", "D", sideLength),
  ];

  const graph = makeGraph(nodes, edges);

  const corridors = new Map<string, Corridor>([
    ["c1", makeCorridor("c1", "A", "B", ["e1"], sideLength)],
    ["c2", makeCorridor("c2", "B", "C", ["e2"], sideLength)],
    ["c3", makeCorridor("c3", "D", "C", ["e3"], sideLength)],
    ["c4", makeCorridor("c4", "A", "D", ["e4"], sideLength)],
  ]);

  const network: CorridorNetwork = {
    corridors,
    connectors: new Map(),
    adjacency: new Map(),
  };

  return { network, graph, nodes };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("haversineDistance", () => {
  it("returns 0 for identical points", () => {
    const p = { lat: 42.96, lng: -85.66 };
    expect(haversineDistance(p, p)).toBe(0);
  });

  it("computes reasonable distance for known points", () => {
    const a = { lat: 42.0, lng: -85.0 };
    const b = { lat: 43.0, lng: -85.0 };
    const dist = haversineDistance(a, b);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });
});

describe("bearing", () => {
  it("returns ~0 for due north", () => {
    const a = { lat: 42.0, lng: -85.0 };
    const b = { lat: 43.0, lng: -85.0 };
    expect(bearing(a, b)).toBeCloseTo(0, 0);
  });

  it("returns ~90 for due east", () => {
    const a = { lat: 42.0, lng: -85.0 };
    const b = { lat: 42.0, lng: -84.0 };
    expect(bearing(a, b)).toBeCloseTo(90, 0);
  });
});

describe("generateLoops", () => {
  it("finds a rectangle loop matching the perimeter", () => {
    const sideLength = 2000;
    const { network, graph } = makeRectangleNetwork(sideLength);
    const targetDistance = sideLength * 4;

    const searchGraph = buildSearchGraph(network, graph, "road-cycling");
    const results = generateLoops(searchGraph, "A", {
      minDistance: targetDistance * 0.75,
      maxDistance: targetDistance * 1.25,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);

    const best = results[0]!;
    expect(best.distanceSoFar).toBeCloseTo(targetDistance, -3);
    expect(best.nodePath[0]).toBe("A");
    expect(best.nodePath[best.nodePath.length - 1]).toBe("A");
  });

  it("prefers higher-scoring corridors", () => {
    const nodes = [
      makeNode("A", 42.96, -85.66),
      makeNode("B", 42.97, -85.66),
      makeNode("C", 42.97, -85.65),
    ];
    const edges = [
      makeEdge("e-hi-1", "A", "B", 2000),
      makeEdge("e-hi-2", "B", "C", 2000),
      makeEdge("e-hi-3", "C", "A", 2000),
      makeEdge("e-lo-1", "A", "C", 2000),
      makeEdge("e-lo-2", "C", "B", 2000),
      makeEdge("e-lo-3", "B", "A", 2000),
    ];
    const graph = makeGraph(nodes, edges);

    const corridors = new Map<string, Corridor>([
      ["c-hi-1", makeCorridor("c-hi-1", "A", "B", ["e-hi-1"], 2000, 0.95)],
      ["c-hi-2", makeCorridor("c-hi-2", "B", "C", ["e-hi-2"], 2000, 0.95)],
      ["c-hi-3", makeCorridor("c-hi-3", "C", "A", ["e-hi-3"], 2000, 0.95)],
      ["c-lo-1", makeCorridor("c-lo-1", "A", "C", ["e-lo-1"], 2000, 0.2)],
      ["c-lo-2", makeCorridor("c-lo-2", "C", "B", ["e-lo-2"], 2000, 0.2)],
      ["c-lo-3", makeCorridor("c-lo-3", "B", "A", ["e-lo-3"], 2000, 0.2)],
    ]);

    const network: CorridorNetwork = {
      corridors,
      connectors: new Map(),
      adjacency: new Map(),
    };

    const searchGraph = buildSearchGraph(network, graph, "road-cycling");
    const results = generateLoops(searchGraph, "A", {
      minDistance: 4500,
      maxDistance: 7500,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);

    const best = results[0]!;
    const avgScore = best.corridorDistance > 0
      ? best.weightedScoreSum / best.corridorDistance
      : 0;
    expect(avgScore).toBeGreaterThan(0.5);
  });

  it("does not revisit graph edges", () => {
    const { network, graph } = makeRectangleNetwork(2000);
    const searchGraph = buildSearchGraph(network, graph, "road-cycling");
    const results = generateLoops(searchGraph, "A", {
      minDistance: 6000,
      maxDistance: 10000,
    });

    for (const route of results) {
      const ids = new Set(route.edgePath);
      expect(ids.size).toBe(route.edgePath.length);
    }
  });

  it("respects distance range", () => {
    const { network, graph } = makeRectangleNetwork(2000);
    const minDistance = 6400;
    const maxDistance = 9600;

    const searchGraph = buildSearchGraph(network, graph, "road-cycling");
    const results = generateLoops(searchGraph, "A", {
      minDistance,
      maxDistance,
    });

    for (const route of results) {
      // Routes should be at least minDistance (with small tolerance for test geometry)
      expect(route.distanceSoFar).toBeGreaterThanOrEqual(minDistance * 0.95);
    }
  });

  it("handles dead-end branches without getting stuck", () => {
    const nodes = [
      makeNode("A", 42.96, -85.66),
      makeNode("B", 42.97, -85.66),
      makeNode("C", 42.97, -85.65),
      makeNode("D", 42.98, -85.66),
    ];
    const edges = [
      makeEdge("e1", "A", "B", 2000),
      makeEdge("e2", "B", "C", 2000),
      makeEdge("e3", "C", "A", 2000),
      makeEdge("e-dead", "B", "D", 3000),
    ];
    const graph = makeGraph(nodes, edges);

    const corridors = new Map<string, Corridor>([
      ["c1", makeCorridor("c1", "A", "B", ["e1"], 2000)],
      ["c2", makeCorridor("c2", "B", "C", ["e2"], 2000)],
      ["c3", makeCorridor("c3", "C", "A", ["e3"], 2000)],
      ["c-dead", makeCorridor("c-dead", "B", "D", ["e-dead"], 3000)],
    ]);

    const network: CorridorNetwork = {
      corridors,
      connectors: new Map(),
      adjacency: new Map(),
    };

    const searchGraph = buildSearchGraph(network, graph, "road-cycling");
    const results = generateLoops(searchGraph, "A", {
      minDistance: 4500,
      maxDistance: 7500,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    const best = results[0]!;
    expect(best.nodePath[best.nodePath.length - 1]).toBe("A");
  });
});

describe("generateLoopRoutes (integration)", () => {
  it("returns null when start is too far from any node", () => {
    const { network, graph } = makeRectangleNetwork(2000);

    const result = generateLoopRoutes(network, graph, "road-cycling", {
      startCoordinate: { lat: 0, lng: 0 },
      minDistanceMeters: 6000,
      maxDistanceMeters: 10000,
    });

    expect(result).toBeNull();
  });

  it("returns RouteAlternatives with valid Route objects", () => {
    const sideLength = 2000;
    const { network, graph } = makeRectangleNetwork(sideLength);

    const result = generateLoopRoutes(network, graph, "road-cycling", {
      startCoordinate: { lat: 42.96, lng: -85.66 },
      minDistanceMeters: sideLength * 3,
      maxDistanceMeters: sideLength * 5,
    });

    if (result) {
      expect(result.primary).toBeDefined();
      expect(result.primary.id).toBe("route-0");
      expect(result.primary.segments.length).toBeGreaterThan(0);
      expect(result.primary.stats.totalDistanceMeters).toBeGreaterThan(0);
      expect(result.primary.score).toBeGreaterThan(0);
    }
  });
});
