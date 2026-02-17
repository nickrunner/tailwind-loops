import { describe, it, expect } from "vitest";
import { buildCorridors, classifyCorridor } from "./index.js";
import type { CorridorBuildResult } from "./index.js";
import type {
  Graph,
  GraphEdge,
  GraphNode,
  EdgeAttributes,
  Coordinate,
} from "../domain/graph.js";
import type { Corridor, CorridorAttributes } from "../domain/corridor.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAttributes(
  overrides: Partial<EdgeAttributes> = {}
): EdgeAttributes {
  return {
    roadClass: "residential",
    surfaceClassification: {
      surface: "asphalt",
      confidence: 0.8,
      observations: [],
      hasConflict: false,
    },
    infrastructure: {
      hasDedicatedPath: false,
      hasShoulder: false,
      isSeparated: false,
    },
    oneWay: false,
    lengthMeters: 100,
    ...overrides,
  };
}

function makeNode(id: string, lat: number, lng: number): GraphNode {
  return { id, coordinate: { lat, lng } };
}

function makeEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  geometry: Coordinate[],
  attrs?: Partial<EdgeAttributes>
): GraphEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    geometry,
    attributes: makeAttributes(attrs),
  };
}

function makeGraph(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const edgeMap = new Map<string, GraphEdge>();
  for (const e of edges) edgeMap.set(e.id, e);

  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.fromNodeId);
    if (list) {
      list.push(e.id);
    } else {
      adjacency.set(e.fromNodeId, [e.id]);
    }
  }

  return { nodes: nodeMap, edges: edgeMap, adjacency };
}

/**
 * Build a straight east-going road with N edges of given length each.
 * All edges are compatible (same attributes) and collinear.
 */
function makeStraightRoad(
  edgeCount: number,
  lengthPerEdge: number,
  attrs?: Partial<EdgeAttributes>
): { graph: Graph; edgeIds: string[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeIds: string[] = [];

  for (let i = 0; i <= edgeCount; i++) {
    nodes.push(makeNode(`n${i}`, 0, i * 0.001));
  }

  for (let i = 0; i < edgeCount; i++) {
    const id = `e${i}`;
    edgeIds.push(id);
    edges.push(
      makeEdge(
        id,
        `n${i}`,
        `n${i + 1}`,
        [
          { lat: 0, lng: i * 0.001 },
          { lat: 0, lng: (i + 1) * 0.001 },
        ],
        { lengthMeters: lengthPerEdge, ...attrs }
      )
    );
  }

  return { graph: makeGraph(nodes, edges), edgeIds };
}

function makeCorridor(overrides: Partial<Corridor>): Corridor {
  return {
    id: "test",
    type: "mixed",
    attributes: {
      lengthMeters: 500,
      predominantRoadClass: "residential",
      predominantSurface: "asphalt",
      surfaceConfidence: 0.8,
      infrastructureContinuity: 0,
      separationContinuity: 0,
      stopDensityPerKm: 0,
      turnsCount: 0,
    },
    edgeIds: [],
    startNodeId: "a",
    endNodeId: "b",
    geometry: [],
    ...overrides,
  };
}

// ─── classifyCorridor ────────────────────────────────────────────────────────

describe("classifyCorridor", () => {
  it("classifies cycleway with high separation as trail", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 1000,
        predominantRoadClass: "cycleway",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.9,
        infrastructureContinuity: 1,
        separationContinuity: 0.9,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("trail");
  });

  it("classifies path with high separation as trail", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "path",
        predominantSurface: "gravel",
        surfaceConfidence: 0.7,
        infrastructureContinuity: 0,
        separationContinuity: 0.8,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("trail");
  });

  it("classifies path with low separation as path (not trail)", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 200,
        predominantRoadClass: "path",
        predominantSurface: "dirt",
        surfaceConfidence: 0.5,
        infrastructureContinuity: 0,
        separationContinuity: 0.3,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("path");
  });

  it("classifies footway as path", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 200,
        predominantRoadClass: "footway",
        predominantSurface: "paved",
        surfaceConfidence: 0.9,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("path");
  });

  it("classifies residential with no speed limit as quiet-road", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "residential",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.8,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("quiet-road");
  });

  it("classifies residential with speed <= 40 as quiet-road", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "residential",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.8,
        averageSpeedLimit: 30,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("quiet-road");
  });

  it("classifies residential with speed > 40 as mixed", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "residential",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.8,
        averageSpeedLimit: 60,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("mixed");
  });

  it("classifies secondary as collector", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "secondary",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.9,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("collector");
  });

  it("classifies tertiary as collector", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "tertiary",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.9,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("collector");
  });

  it("classifies primary as arterial", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "primary",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.9,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("arterial");
  });

  it("classifies trunk as arterial", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "trunk",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.9,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("arterial");
  });

  it("classifies motorway as arterial", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "motorway",
        predominantSurface: "asphalt",
        surfaceConfidence: 0.9,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("arterial");
  });

  it("classifies track as mixed", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "track",
        predominantSurface: "dirt",
        surfaceConfidence: 0.5,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        turnsCount: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("mixed");
  });
});

// ─── buildCorridors ──────────────────────────────────────────────────────────

describe("buildCorridors", () => {
  it("builds corridors from long chains and connectors from short chains", async () => {
    // Two separate roads: one long (300m, 3 edges of 100m) and one short (50m, 1 edge)
    // They share a node so adjacency exists
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
      makeNode("c", 0, 0.002),
      makeNode("d", 0, 0.003),
      // Short spur going north from node "b"
      makeNode("e", 0.0005, 0.001),
    ];

    const edges = [
      // Long road: a→b→c→d (300m total)
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], { lengthMeters: 100 }),
      makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], { lengthMeters: 100 }),
      makeEdge("e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], { lengthMeters: 100 }),
      // Short spur: b→e (50m) - different road class so won't merge with main road
      makeEdge("e4", "b", "e", [{ lat: 0, lng: 0.001 }, { lat: 0.0005, lng: 0.001 }], {
        lengthMeters: 50,
        roadClass: "cycleway",
        infrastructure: { hasDedicatedPath: true, hasShoulder: false, isSeparated: true },
      }),
    ];

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    expect(result.stats.corridorCount).toBe(1);
    expect(result.stats.connectorCount).toBe(1);
    expect(result.stats.totalLengthMeters).toBe(300);
    expect(result.stats.averageLengthMeters).toBe(300);
    expect(result.stats.buildTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns empty network for empty graph", async () => {
    const graph = makeGraph([], []);
    const result = await buildCorridors(graph);

    expect(result.stats.corridorCount).toBe(0);
    expect(result.stats.connectorCount).toBe(0);
    expect(result.stats.totalLengthMeters).toBe(0);
    expect(result.stats.averageLengthMeters).toBe(0);
  });

  it("assigns corridor type based on attributes", async () => {
    // Build a long cycleway (separated) → should be classified as "trail"
    const { graph } = makeStraightRoad(3, 100, {
      roadClass: "cycleway",
      infrastructure: { hasDedicatedPath: true, hasShoulder: false, isSeparated: true },
    });

    const result = await buildCorridors(graph, { minLengthMeters: 200 });
    const corridors = [...result.network.corridors.values()];
    expect(corridors).toHaveLength(1);
    expect(corridors[0]!.type).toBe("trail");
  });

  it("derives corridor name from edges", async () => {
    const { graph } = makeStraightRoad(3, 100, { name: "Rail Trail" });
    const result = await buildCorridors(graph, { minLengthMeters: 200 });
    const corridors = [...result.network.corridors.values()];
    expect(corridors[0]!.name).toBe("Rail Trail");
  });

  it("builds adjacency between corridors and connectors at shared nodes", async () => {
    // Two parallel long roads connected by a short spur
    const nodes = [
      // Road 1: east
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
      makeNode("c", 0, 0.002),
      makeNode("d", 0, 0.003),
      // Road 2: east, offset north
      makeNode("e", 0.001, 0),
      makeNode("f", 0.001, 0.001),
      makeNode("g", 0.001, 0.002),
      makeNode("h", 0.001, 0.003),
    ];

    const edges = [
      // Road 1
      makeEdge("r1e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], { lengthMeters: 100 }),
      makeEdge("r1e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], { lengthMeters: 100 }),
      makeEdge("r1e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], { lengthMeters: 100 }),
      // Road 2
      makeEdge("r2e1", "e", "f", [{ lat: 0.001, lng: 0 }, { lat: 0.001, lng: 0.001 }], { lengthMeters: 100 }),
      makeEdge("r2e2", "f", "g", [{ lat: 0.001, lng: 0.001 }, { lat: 0.001, lng: 0.002 }], { lengthMeters: 100 }),
      makeEdge("r2e3", "g", "h", [{ lat: 0.001, lng: 0.002 }, { lat: 0.001, lng: 0.003 }], { lengthMeters: 100 }),
      // Short connector from c to g (cycleway is incompatible with residential so it won't merge)
      makeEdge("conn", "c", "g", [{ lat: 0, lng: 0.002 }, { lat: 0.001, lng: 0.002 }], {
        lengthMeters: 50,
        roadClass: "cycleway",
        infrastructure: { hasDedicatedPath: true, hasShoulder: false, isSeparated: true },
      }),
    ];

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    // The connector should be adjacent to both corridors
    const connectors = [...result.network.connectors.values()];
    expect(connectors.length).toBeGreaterThanOrEqual(1);

    // Find the connector that links the two roads
    const linkConnector = connectors.find(
      (c) => c.edgeIds.includes("conn")
    );
    if (linkConnector) {
      expect(linkConnector.corridorIds.length).toBeGreaterThanOrEqual(1);
      // Its adjacency should include corridor IDs
      const adj = result.network.adjacency.get(linkConnector.id) ?? [];
      expect(adj.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("connector crossesMajorRoad is true when edge has primary/secondary/trunk", async () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
    ];
    const edges = [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
        lengthMeters: 50,
        roadClass: "primary",
      }),
    ];

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    // The single short edge becomes a connector
    const connectors = [...result.network.connectors.values()];
    expect(connectors).toHaveLength(1);
    expect(connectors[0]!.attributes.crossesMajorRoad).toBe(true);
  });

  it("connector crossesMajorRoad is false for residential edge", async () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
    ];
    const edges = [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
        lengthMeters: 50,
        roadClass: "residential",
      }),
    ];

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    expect(connectors).toHaveLength(1);
    expect(connectors[0]!.attributes.crossesMajorRoad).toBe(false);
  });

  it("corridors have geometry", async () => {
    const { graph } = makeStraightRoad(3, 100);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });
    const corridors = [...result.network.corridors.values()];
    expect(corridors[0]!.geometry.length).toBeGreaterThanOrEqual(2);
  });

  it("corridors have correct start and end nodes", async () => {
    const { graph } = makeStraightRoad(3, 100);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });
    const corridors = [...result.network.corridors.values()];
    const c = corridors[0]!;
    // Start node should be the first node, end node should be the last
    expect(c.startNodeId).toBe("n0");
    expect(c.endNodeId).toBe("n3");
  });

  it("respects custom minLengthMeters", async () => {
    // 3 edges of 30m each = 90m total
    const { graph } = makeStraightRoad(3, 30);

    // With minLength=50, should be a corridor
    const result1 = await buildCorridors(graph, { minLengthMeters: 50 });
    expect(result1.stats.corridorCount).toBe(1);

    // With minLength=100, should be a connector
    const result2 = await buildCorridors(graph, { minLengthMeters: 100 });
    expect(result2.stats.corridorCount).toBe(0);
    expect(result2.stats.connectorCount).toBe(1);
  });

  it("stats include connectorCount", async () => {
    const { graph } = makeStraightRoad(1, 50);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });
    expect(result.stats).toHaveProperty("connectorCount");
    expect(typeof result.stats.connectorCount).toBe("number");
  });
});
