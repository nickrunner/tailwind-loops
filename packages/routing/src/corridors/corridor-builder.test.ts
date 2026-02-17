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
 * Adds stub edges at both endpoints (different road class, 90° angle)
 * so that endpoints are intersections (degree >= 2), not dead ends.
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

  // Small triangles at endpoints to create 2-core intersections (survive iterative pruning)
  nodes.push(makeNode("stub_s1", 0.001, -0.001));
  nodes.push(makeNode("stub_s2", 0.001, 0.001));
  edges.push(
    makeEdge("stub_s1", "n0", "stub_s1",
      [{ lat: 0, lng: 0 }, { lat: 0.001, lng: -0.001 }],
      { lengthMeters: 10, roadClass: "track" })
  );
  edges.push(
    makeEdge("stub_s2", "stub_s1", "stub_s2",
      [{ lat: 0.001, lng: -0.001 }, { lat: 0.001, lng: 0.001 }],
      { lengthMeters: 10, roadClass: "track" })
  );
  edges.push(
    makeEdge("stub_s3", "stub_s2", "n0",
      [{ lat: 0.001, lng: 0.001 }, { lat: 0, lng: 0 }],
      { lengthMeters: 10, roadClass: "track" })
  );

  const eLng = edgeCount * 0.001;
  nodes.push(makeNode("stub_e1", 0.001, eLng - 0.001));
  nodes.push(makeNode("stub_e2", 0.001, eLng + 0.001));
  edges.push(
    makeEdge("stub_e1", `n${edgeCount}`, "stub_e1",
      [{ lat: 0, lng: eLng }, { lat: 0.001, lng: eLng - 0.001 }],
      { lengthMeters: 10, roadClass: "track" })
  );
  edges.push(
    makeEdge("stub_e2", "stub_e1", "stub_e2",
      [{ lat: 0.001, lng: eLng - 0.001 }, { lat: 0.001, lng: eLng + 0.001 }],
      { lengthMeters: 10, roadClass: "track" })
  );
  edges.push(
    makeEdge("stub_e3", "stub_e2", `n${edgeCount}`,
      [{ lat: 0.001, lng: eLng + 0.001 }, { lat: 0, lng: eLng }],
      { lengthMeters: 10, roadClass: "track" })
  );

  return { graph: makeGraph(nodes, edges), edgeIds };
}

/**
 * Add a small triangle loop at a node so it survives 2-core pruning.
 * Uses service road class (incompatible with most corridors) and 90° angles.
 */
function addTriangleStub(
  nodeId: string,
  baseLat: number,
  baseLng: number,
  prefix: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): void {
  nodes.push(makeNode(`${prefix}1`, baseLat + 0.001, baseLng - 0.001));
  nodes.push(makeNode(`${prefix}2`, baseLat + 0.001, baseLng + 0.001));
  edges.push(
    makeEdge(`${prefix}1`, nodeId, `${prefix}1`,
      [{ lat: baseLat, lng: baseLng }, { lat: baseLat + 0.001, lng: baseLng - 0.001 }],
      { lengthMeters: 10, roadClass: "track" })
  );
  edges.push(
    makeEdge(`${prefix}2`, `${prefix}1`, `${prefix}2`,
      [{ lat: baseLat + 0.001, lng: baseLng - 0.001 }, { lat: baseLat + 0.001, lng: baseLng + 0.001 }],
      { lengthMeters: 10, roadClass: "track" })
  );
  edges.push(
    makeEdge(`${prefix}3`, `${prefix}2`, nodeId,
      [{ lat: baseLat + 0.001, lng: baseLng + 0.001 }, { lat: baseLat, lng: baseLng }],
      { lengthMeters: 10, roadClass: "track" })
  );
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
    oneWay: false,
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
    // Long road a→b→c→d (300m) + short spur b→e (50m cycleway)
    // Triangle stubs at a, d, e so they survive 2-core pruning
    const nodes: GraphNode[] = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
      makeNode("c", 0, 0.002),
      makeNode("d", 0, 0.003),
      makeNode("e", 0.0005, 0.001),
    ];
    const edges: GraphEdge[] = [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], { lengthMeters: 100 }),
      makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], { lengthMeters: 100 }),
      makeEdge("e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], { lengthMeters: 100 }),
      makeEdge("e4", "b", "e", [{ lat: 0, lng: 0.001 }, { lat: 0.0005, lng: 0.001 }], {
        lengthMeters: 50, roadClass: "cycleway",
        infrastructure: { hasDedicatedPath: true, hasShoulder: false, isSeparated: true },
      }),
    ];
    addTriangleStub("a", 0, 0, "sa", nodes, edges);
    addTriangleStub("d", 0, 0.003, "sd", nodes, edges);
    addTriangleStub("e", 0.0005, 0.001, "se", nodes, edges);

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    expect(result.stats.corridorCount).toBe(1);
    expect(result.stats.connectorCount).toBeGreaterThanOrEqual(1);
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
    // Triangle stubs at dead-end endpoints (a, d, e, h)
    const nodes: GraphNode[] = [
      makeNode("a", 0, 0), makeNode("b", 0, 0.001),
      makeNode("c", 0, 0.002), makeNode("d", 0, 0.003),
      makeNode("e", 0.001, 0), makeNode("f", 0.001, 0.001),
      makeNode("g", 0.001, 0.002), makeNode("h", 0.001, 0.003),
    ];
    const edges: GraphEdge[] = [
      makeEdge("r1e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], { lengthMeters: 100 }),
      makeEdge("r1e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], { lengthMeters: 100 }),
      makeEdge("r1e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], { lengthMeters: 100 }),
      makeEdge("r2e1", "e", "f", [{ lat: 0.001, lng: 0 }, { lat: 0.001, lng: 0.001 }], { lengthMeters: 100 }),
      makeEdge("r2e2", "f", "g", [{ lat: 0.001, lng: 0.001 }, { lat: 0.001, lng: 0.002 }], { lengthMeters: 100 }),
      makeEdge("r2e3", "g", "h", [{ lat: 0.001, lng: 0.002 }, { lat: 0.001, lng: 0.003 }], { lengthMeters: 100 }),
      makeEdge("conn", "c", "g", [{ lat: 0, lng: 0.002 }, { lat: 0.001, lng: 0.002 }], {
        lengthMeters: 50, roadClass: "cycleway",
        infrastructure: { hasDedicatedPath: true, hasShoulder: false, isSeparated: true },
      }),
    ];
    addTriangleStub("a", 0, 0, "sa", nodes, edges);
    addTriangleStub("d", 0, 0.003, "sd", nodes, edges);
    addTriangleStub("e", 0.001, 0, "se", nodes, edges);
    addTriangleStub("h", 0.001, 0.003, "sh", nodes, edges);

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    expect(connectors.length).toBeGreaterThanOrEqual(1);

    const linkConnector = connectors.find((c) => c.edgeIds.includes("conn"));
    if (linkConnector) {
      expect(linkConnector.corridorIds.length).toBeGreaterThanOrEqual(1);
      const adj = result.network.adjacency.get(linkConnector.id) ?? [];
      expect(adj.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("connector crossesMajorRoad is true when edge has primary/secondary/trunk", async () => {
    const nodes: GraphNode[] = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
    ];
    const edges: GraphEdge[] = [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
        lengthMeters: 50, roadClass: "primary",
      }),
    ];
    addTriangleStub("a", 0, 0, "sa", nodes, edges);
    addTriangleStub("b", 0, 0.001, "sb", nodes, edges);

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    const primaryConn = connectors.find((c) => c.edgeIds.includes("e1"));
    expect(primaryConn).toBeDefined();
    expect(primaryConn!.attributes.crossesMajorRoad).toBe(true);
  });

  it("connector crossesMajorRoad is false for residential edge", async () => {
    const nodes: GraphNode[] = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
    ];
    const edges: GraphEdge[] = [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
        lengthMeters: 50, roadClass: "residential",
      }),
    ];
    addTriangleStub("a", 0, 0, "sa", nodes, edges);
    addTriangleStub("b", 0, 0.001, "sb", nodes, edges);

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    const resConn = connectors.find((c) => c.edgeIds.includes("e1"));
    expect(resConn).toBeDefined();
    expect(resConn!.attributes.crossesMajorRoad).toBe(false);
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

    // With minLength=100, main chain should be a connector (plus stub connectors)
    const result2 = await buildCorridors(graph, { minLengthMeters: 100 });
    expect(result2.stats.corridorCount).toBe(0);
    expect(result2.stats.connectorCount).toBeGreaterThanOrEqual(1);
  });

  it("stats include connectorCount", async () => {
    const { graph } = makeStraightRoad(1, 50);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });
    expect(result.stats).toHaveProperty("connectorCount");
    expect(typeof result.stats.connectorCount).toBe("number");
    expect(result.stats.connectorCount).toBeGreaterThanOrEqual(0);
  });
});
