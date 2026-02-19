import { describe, it, expect } from "vitest";
import { buildCorridors, classifyCorridor } from "./index.js";
import type { CorridorBuildResult } from "./index.js";
import type {
  Graph,
  GraphEdge,
  GraphNode,
  EdgeAttributes,
  Coordinate,
} from "@tailwind-loops/types";
import type { Corridor, CorridorAttributes } from "@tailwind-loops/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAttributes(
  overrides: Partial<EdgeAttributes> = {}
): EdgeAttributes {
  return {
    roadClass: "residential",
    surfaceClassification: {
      surface: "paved",
      confidence: 0.8,
      observations: [],
      hasConflict: false,
    },
    infrastructure: {
      hasBicycleInfra: false,
      hasPedestrianPath: false,
      hasShoulder: false,
      isSeparated: false,
      hasTrafficCalming: false,
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

/**
 * Build two parallel long roads (300m each) connected by a single short
 * bridge edge with the given attributes. The bridge survives connector
 * sanitization because it connects 2 distinct corridors.
 * Returns the graph and the bridge edge ID.
 */
function makeBridgedCorridors(
  bridgeEdgeAttrs?: Partial<EdgeAttributes>
): { graph: Graph; bridgeEdgeId: string } {
  const nodes: GraphNode[] = [
    // Road 1: a→b→c→d
    makeNode("a", 0, 0),
    makeNode("b", 0, 0.001),
    makeNode("c", 0, 0.002),
    makeNode("d", 0, 0.003),
    // Road 2: e→f→g→h
    makeNode("e", 0.001, 0),
    makeNode("f", 0.001, 0.001),
    makeNode("g", 0.001, 0.002),
    makeNode("h", 0.001, 0.003),
  ];
  const edges: GraphEdge[] = [
    makeEdge("r1e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], { lengthMeters: 100 }),
    makeEdge("r1e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], { lengthMeters: 100 }),
    makeEdge("r1e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], { lengthMeters: 100 }),
    makeEdge("r2e1", "e", "f", [{ lat: 0.001, lng: 0 }, { lat: 0.001, lng: 0.001 }], { lengthMeters: 100 }),
    makeEdge("r2e2", "f", "g", [{ lat: 0.001, lng: 0.001 }, { lat: 0.001, lng: 0.002 }], { lengthMeters: 100 }),
    makeEdge("r2e3", "g", "h", [{ lat: 0.001, lng: 0.002 }, { lat: 0.001, lng: 0.003 }], { lengthMeters: 100 }),
    // Bridge connecting c (road 1) to g (road 2)
    makeEdge("bridge", "c", "g", [{ lat: 0, lng: 0.002 }, { lat: 0.001, lng: 0.002 }], {
      lengthMeters: 50, ...bridgeEdgeAttrs,
    }),
  ];
  addTriangleStub("a", 0, 0, "sa", nodes, edges);
  addTriangleStub("d", 0, 0.003, "sd", nodes, edges);
  addTriangleStub("e", 0.001, 0, "se", nodes, edges);
  addTriangleStub("h", 0.001, 0.003, "sh", nodes, edges);

  return { graph: makeGraph(nodes, edges), bridgeEdgeId: "bridge" };
}

function makeCorridor(overrides: Partial<Corridor>): Corridor {
  return {
    id: "test",
    type: "mixed",
    attributes: {
      lengthMeters: 500,
      predominantRoadClass: "residential",
      predominantSurface: "paved",
      surfaceConfidence: 0.8,
      bicycleInfraContinuity: 0,
      pedestrianPathContinuity: 0,
      separationContinuity: 0,
      stopDensityPerKm: 0,
      crossingDensityPerKm: 0,
      turnsCount: 0,
      trafficCalmingContinuity: 0,
      scenicScore: 0,
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
        predominantSurface: "paved",
        surfaceConfidence: 0.9,
        bicycleInfraContinuity: 1,
        pedestrianPathContinuity: 0,
        separationContinuity: 0.9,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("trail");
  });

  it("classifies path with high separation as trail", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "path",
        predominantSurface: "unpaved",
        surfaceConfidence: 0.7,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0.8,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("trail");
  });

  it("classifies path with low separation as path (not trail)", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 200,
        predominantRoadClass: "path",
        predominantSurface: "unpaved",
        surfaceConfidence: 0.5,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0.3,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
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
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("path");
  });

  it("classifies residential with no speed limit and no urban signals as rural-road", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "residential",
        predominantSurface: "paved",
        surfaceConfidence: 0.8,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("rural-road");
  });

  it("classifies residential with sidewalks as neighborhood", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "residential",
        predominantSurface: "paved",
        surfaceConfidence: 0.8,
        averageSpeedLimit: 30,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0.5,
        separationContinuity: 0,
        stopDensityPerKm: 3,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0.4,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("neighborhood");
  });

  it("classifies residential with high crossing density as neighborhood (even without tagged stops)", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "residential",
        predominantSurface: "paved",
        surfaceConfidence: 0.8,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 6,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("neighborhood");
  });

  it("classifies residential with high stop density as neighborhood", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "residential",
        predominantSurface: "paved",
        surfaceConfidence: 0.8,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 4,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("neighborhood");
  });

  it("classifies residential with speed > 40 as mixed", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "residential",
        predominantSurface: "paved",
        surfaceConfidence: 0.8,
        averageSpeedLimit: 60,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("mixed");
  });

  it("classifies secondary as collector", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "secondary",
        predominantSurface: "paved",
        surfaceConfidence: 0.9,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("collector");
  });

  it("classifies tertiary as collector", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "tertiary",
        predominantSurface: "paved",
        surfaceConfidence: 0.9,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("collector");
  });

  it("classifies primary as arterial", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "primary",
        predominantSurface: "paved",
        surfaceConfidence: 0.9,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("arterial");
  });

  it("classifies trunk as arterial", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "trunk",
        predominantSurface: "paved",
        surfaceConfidence: 0.9,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("arterial");
  });

  it("classifies motorway as arterial", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "motorway",
        predominantSurface: "paved",
        surfaceConfidence: 0.9,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("arterial");
  });

  it("classifies track as mixed", () => {
    const corridor = makeCorridor({
      attributes: {
        lengthMeters: 500,
        predominantRoadClass: "track",
        predominantSurface: "unpaved",
        surfaceConfidence: 0.5,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 0,
        crossingDensityPerKm: 0,
        turnsCount: 0,
        trafficCalmingContinuity: 0,
        scenicScore: 0,
      },
    });
    expect(classifyCorridor(corridor)).toBe("mixed");
  });
});

// ─── buildCorridors ──────────────────────────────────────────────────────────

describe("buildCorridors", () => {
  it("builds corridors from long chains and connectors from short chains", async () => {
    // Two parallel long roads (300m each) connected by a short spur (50m cycleway)
    // The spur bridges two corridors, so it survives connector sanitization
    const nodes: GraphNode[] = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
      makeNode("c", 0, 0.002),
      makeNode("d", 0, 0.003),
      makeNode("e", 0.001, 0.001),  // spur endpoint = start of second road
      makeNode("f", 0.001, 0.002),
      makeNode("g", 0.001, 0.003),
      makeNode("h", 0.001, 0.004),
    ];
    const edges: GraphEdge[] = [
      // Road 1: a→b→c→d (300m)
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], { lengthMeters: 100 }),
      makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], { lengthMeters: 100 }),
      makeEdge("e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], { lengthMeters: 100 }),
      // Road 2: e→f→g→h (300m)
      makeEdge("r2e1", "e", "f", [{ lat: 0.001, lng: 0.001 }, { lat: 0.001, lng: 0.002 }], { lengthMeters: 100 }),
      makeEdge("r2e2", "f", "g", [{ lat: 0.001, lng: 0.002 }, { lat: 0.001, lng: 0.003 }], { lengthMeters: 100 }),
      makeEdge("r2e3", "g", "h", [{ lat: 0.001, lng: 0.003 }, { lat: 0.001, lng: 0.004 }], { lengthMeters: 100 }),
      // Short spur connecting road 1 (node b) to road 2 (node e)
      makeEdge("spur", "b", "e", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.001 }], {
        lengthMeters: 50, roadClass: "cycleway",
        infrastructure: { hasBicycleInfra: true, hasPedestrianPath: false, hasShoulder: false, isSeparated: true, hasTrafficCalming: false },
      }),
    ];
    addTriangleStub("a", 0, 0, "sa", nodes, edges);
    addTriangleStub("d", 0, 0.003, "sd", nodes, edges);
    addTriangleStub("e", 0.001, 0.001, "se", nodes, edges);
    addTriangleStub("h", 0.001, 0.004, "sh", nodes, edges);

    const graph = makeGraph(nodes, edges);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    expect(result.stats.corridorCount).toBe(2);
    expect(result.stats.connectorCount).toBeGreaterThanOrEqual(1);
    expect(result.stats.totalLengthMeters).toBe(600);
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
    // 500m exceeds the 400m dedicatedInfra tier threshold
    const { graph } = makeStraightRoad(5, 100, {
      roadClass: "cycleway",
      infrastructure: { hasBicycleInfra: true, hasPedestrianPath: false, hasShoulder: false, isSeparated: true, hasTrafficCalming: false },
    });

    const result = await buildCorridors(graph);
    const corridors = [...result.network.corridors.values()];
    expect(corridors).toHaveLength(1);
    expect(corridors[0]!.type).toBe("trail");
  });

  it("derives corridor name from edges", async () => {
    // 10 edges of 100m = 1000m, named "Rail Trail", residential
    // namedRoad tier (1609m) halved by name bonus (100% coverage) = ~805m → 1000m qualifies
    const { graph } = makeStraightRoad(10, 100, { name: "Rail Trail" });
    const result = await buildCorridors(graph);
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
        infrastructure: { hasBicycleInfra: true, hasPedestrianPath: false, hasShoulder: false, isSeparated: true, hasTrafficCalming: false },
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
    const { graph, bridgeEdgeId } = makeBridgedCorridors({ roadClass: "primary" });
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    const primaryConn = connectors.find((c) => c.edgeIds.includes(bridgeEdgeId));
    expect(primaryConn).toBeDefined();
    expect(primaryConn!.attributes.crossesMajorRoad).toBe(true);
  });

  it("connector crossesMajorRoad is false for residential edge", async () => {
    const { graph, bridgeEdgeId } = makeBridgedCorridors({ roadClass: "residential" });
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    const resConn = connectors.find((c) => c.edgeIds.includes(bridgeEdgeId));
    expect(resConn).toBeDefined();
    expect(resConn!.attributes.crossesMajorRoad).toBe(false);
  });

  it("connector hasStop is true when edge has stopSignCount", async () => {
    const { graph, bridgeEdgeId } = makeBridgedCorridors({ roadClass: "residential", stopSignCount: 1 });
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    const conn = connectors.find((c) => c.edgeIds.includes(bridgeEdgeId));
    expect(conn).toBeDefined();
    expect(conn!.attributes.hasStop).toBe(true);
    expect(conn!.attributes.hasSignal).toBe(false);
  });

  it("connector hasSignal is true when edge has trafficSignalCount", async () => {
    const { graph, bridgeEdgeId } = makeBridgedCorridors({ roadClass: "primary", trafficSignalCount: 1 });
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    const conn = connectors.find((c) => c.edgeIds.includes(bridgeEdgeId));
    expect(conn).toBeDefined();
    expect(conn!.attributes.hasSignal).toBe(true);
    // Signal at major road → crossingDifficulty = 0.3
    expect(conn!.attributes.crossingDifficulty).toBe(0.3);
  });

  it("connector crossingDifficulty is 0.7 for major road without signal", async () => {
    const { graph, bridgeEdgeId } = makeBridgedCorridors({ roadClass: "primary" });
    const result = await buildCorridors(graph, { minLengthMeters: 200 });

    const connectors = [...result.network.connectors.values()];
    const conn = connectors.find((c) => c.edgeIds.includes(bridgeEdgeId));
    expect(conn).toBeDefined();
    expect(conn!.attributes.crossesMajorRoad).toBe(true);
    expect(conn!.attributes.crossingDifficulty).toBe(0.7);
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

    // With minLength=100, nothing qualifies as a corridor, and connectors
    // that don't bridge 2+ corridors are sanitized away
    const result2 = await buildCorridors(graph, { minLengthMeters: 100 });
    expect(result2.stats.corridorCount).toBe(0);
    expect(result2.stats.connectorCount).toBe(0);
  });

  it("stats include connectorCount", async () => {
    const { graph } = makeStraightRoad(1, 50);
    const result = await buildCorridors(graph, { minLengthMeters: 200 });
    expect(result.stats).toHaveProperty("connectorCount");
    expect(typeof result.stats.connectorCount).toBe("number");
    expect(result.stats.connectorCount).toBeGreaterThanOrEqual(0);
  });

  describe("smart corridor detection", () => {
    it("promotes short separated cycleway to corridor (dedicatedInfra tier)", async () => {
      // 500m cycleway — below old 1609m default but above 400m dedicatedInfra tier
      const { graph, edgeIds } = makeStraightRoad(5, 100, {
        roadClass: "cycleway",
        infrastructure: {
          hasBicycleInfra: true,
          hasPedestrianPath: false,
          hasShoulder: false,
          isSeparated: true,
          hasTrafficCalming: false,
        },
      });

      // With default options (no explicit minLengthMeters), smart detection should kick in
      const result = await buildCorridors(graph);
      const corridors = [...result.network.corridors.values()];
      const cyclewayCorr = corridors.find((c) =>
        edgeIds.some((id) => c.edgeIds.includes(id))
      );
      expect(cyclewayCorr).toBeDefined();
      expect(cyclewayCorr!.type).toBe("trail");
    });

    it("promotes named road with bike infra to corridor (namedBikeInfra tier)", async () => {
      // 500m named bike boulevard — below 1609m but above 400m namedBikeInfra tier
      // (with name bonus: 400 * 0.5 = 200m effective threshold)
      const { graph, edgeIds } = makeStraightRoad(5, 100, {
        roadClass: "residential",
        name: "Bike Boulevard",
        infrastructure: {
          hasBicycleInfra: true,
          hasPedestrianPath: false,
          hasShoulder: false,
          isSeparated: false,
          hasTrafficCalming: false,
        },
      });

      const result = await buildCorridors(graph);
      const corridors = [...result.network.corridors.values()];
      const bikeCorr = corridors.find((c) =>
        edgeIds.some((id) => c.edgeIds.includes(id))
      );
      expect(bikeCorr).toBeDefined();
    });

    it("keeps long inconsistent chain as connector when homogeneity is low", async () => {
      // Build a chain where alternating edges have very different attributes
      // but are in the same road class group (residential/service).
      // All unnamed so it falls into the "unnamed" tier (1609m).
      // Max infra differences drive homogeneity well below 0.7,
      // inflating the threshold beyond the total chain length.
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];
      const edgeIds: string[] = [];
      const count = 10;

      for (let i = 0; i <= count; i++) {
        nodes.push(makeNode(`n${i}`, 0, i * 0.001));
      }

      for (let i = 0; i < count; i++) {
        const id = `e${i}`;
        edgeIds.push(id);
        const isEven = i % 2 === 0;
        edges.push(
          makeEdge(
            id,
            `n${i}`,
            `n${i + 1}`,
            [
              { lat: 0, lng: i * 0.001 },
              { lat: 0, lng: (i + 1) * 0.001 },
            ],
            {
              lengthMeters: 200,
              roadClass: isEven ? "residential" : "service",
              surfaceClassification: {
                surface: isEven ? "paved" : "unpaved",
                confidence: 0.8,
                observations: [],
                hasConflict: false,
              },
              infrastructure: {
                hasBicycleInfra: isEven,
                hasPedestrianPath: isEven,
                hasShoulder: isEven,
                isSeparated: isEven,
                hasTrafficCalming: isEven,
              },
            }
          )
        );
      }

      // Add triangle stubs so endpoints survive pruning
      const eLng = count * 0.001;
      addTriangleStub("n0", 0, 0, "sa", nodes, edges);
      addTriangleStub(`n${count}`, 0, eLng, "sb", nodes, edges);

      const graph = makeGraph(nodes, edges);
      const result = await buildCorridors(graph);

      // The alternating-attribute chain should NOT be a corridor
      // because the homogeneity penalty inflates the threshold
      const corridors = [...result.network.corridors.values()];
      const junkCorr = corridors.find((c) =>
        edgeIds.some((id) => c.edgeIds.includes(id))
      );
      expect(junkCorr).toBeUndefined();
    });
  });
});
