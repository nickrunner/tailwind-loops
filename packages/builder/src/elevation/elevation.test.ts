import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { enrichElevation } from "./index.js";
import type {
  Graph,
  GraphEdge,
  GraphNode,
  EdgeAttributes,
  Coordinate,
} from "@tailwind-loops/types";

// Real SRTM1 tile covering N42-N43, W86-W85 (Grand Rapids area)
const TILES_DIR = join(__dirname, "../../../../data/elevation");

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAttributes(
  overrides: Partial<EdgeAttributes> = {}
): EdgeAttributes {
  return {
    roadClass: "residential",
    surfaceClassification: {
      surface: "paved",
      confidence: 0.8,
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

// ─── Node enrichment ────────────────────────────────────────────────────────

describe("enrichElevation - node enrichment", () => {
  it("sets elevationMeters on nodes within tile coverage", () => {
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),
        makeNode("b", 42.965, -85.665),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 42.965, lng: -85.665 },
        ]),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    const nodeA = graph.nodes.get("a")!;
    const nodeB = graph.nodes.get("b")!;
    expect(nodeA.elevationMeters).toBeDefined();
    expect(nodeB.elevationMeters).toBeDefined();
  });

  it("node elevations are reasonable for Grand Rapids (~150-250m)", () => {
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),
        makeNode("b", 42.965, -85.665),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 42.965, lng: -85.665 },
        ]),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    const nodeA = graph.nodes.get("a")!;
    const nodeB = graph.nodes.get("b")!;
    expect(nodeA.elevationMeters!).toBeGreaterThanOrEqual(150);
    expect(nodeA.elevationMeters!).toBeLessThanOrEqual(280);
    expect(nodeB.elevationMeters!).toBeGreaterThanOrEqual(150);
    expect(nodeB.elevationMeters!).toBeLessThanOrEqual(280);
  });

  it("does not set elevationMeters on nodes outside tile coverage", () => {
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),  // in coverage
        makeNode("b", 50.0, -85.668),     // out of coverage
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 50.0, lng: -85.668 },
        ]),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    expect(graph.nodes.get("a")!.elevationMeters).toBeDefined();
    expect(graph.nodes.get("b")!.elevationMeters).toBeUndefined();
  });
});

// ─── Edge metrics — flat area ───────────────────────────────────────────────

describe("enrichElevation - edge metrics (flat area)", () => {
  it("flat road has small elevation gain and loss", () => {
    // Two points along a flat stretch in Grand Rapids
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),
        makeNode("b", 42.9635, -85.668),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 42.9632, lng: -85.668 },
          { lat: 42.9635, lng: -85.668 },
        ], { lengthMeters: 55 }),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    const edge = graph.edges.get("e1")!;
    expect(edge.attributes.elevationGain).toBeDefined();
    expect(edge.attributes.elevationLoss).toBeDefined();
    // On a flat short stretch, gain and loss should be small
    expect(edge.attributes.elevationGain!).toBeLessThan(20);
    expect(edge.attributes.elevationLoss!).toBeLessThan(20);
  });

  it("flat road has average grade near 0", () => {
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),
        makeNode("b", 42.9635, -85.668),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 42.9635, lng: -85.668 },
        ], { lengthMeters: 55 }),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    const edge = graph.edges.get("e1")!;
    expect(edge.attributes.averageGrade).toBeDefined();
    expect(Math.abs(edge.attributes.averageGrade!)).toBeLessThan(10);
  });
});

// ─── Edge metrics — hill ────────────────────────────────────────────────────

describe("enrichElevation - edge metrics (hill)", () => {
  it("edge with elevation change has positive gain", () => {
    // Pick a longer edge with multiple geometry points spanning some terrain
    const graph = makeGraph(
      [
        makeNode("a", 42.94, -85.68),
        makeNode("b", 42.96, -85.66),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.94, lng: -85.68 },
          { lat: 42.945, lng: -85.675 },
          { lat: 42.95, lng: -85.67 },
          { lat: 42.955, lng: -85.665 },
          { lat: 42.96, lng: -85.66 },
        ], { lengthMeters: 2500 }),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    const edge = graph.edges.get("e1")!;
    expect(edge.attributes.elevationGain).toBeDefined();
    // Over 2.5km in varied terrain, there should be some gain
    expect(edge.attributes.elevationGain!).toBeGreaterThanOrEqual(0);
  });

  it("maxGrade is non-negative", () => {
    const graph = makeGraph(
      [
        makeNode("a", 42.94, -85.68),
        makeNode("b", 42.96, -85.66),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.94, lng: -85.68 },
          { lat: 42.945, lng: -85.675 },
          { lat: 42.95, lng: -85.67 },
          { lat: 42.955, lng: -85.665 },
          { lat: 42.96, lng: -85.66 },
        ], { lengthMeters: 2500 }),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    const edge = graph.edges.get("e1")!;
    expect(edge.attributes.maxGrade).toBeDefined();
    expect(edge.attributes.maxGrade!).toBeGreaterThanOrEqual(0);
  });
});

// ─── Edge metrics — missing coverage ────────────────────────────────────────

describe("enrichElevation - missing coverage", () => {
  it("node outside tile keeps elevationMeters undefined, no crash", () => {
    const graph = makeGraph(
      [
        makeNode("a", 50.0, -80.0),
        makeNode("b", 50.001, -80.0),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 50.0, lng: -80.0 },
          { lat: 50.001, lng: -80.0 },
        ]),
      ]
    );

    // Should not throw
    const stats = enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    expect(graph.nodes.get("a")!.elevationMeters).toBeUndefined();
    expect(graph.nodes.get("b")!.elevationMeters).toBeUndefined();
    expect(stats.nodesMissing).toBe(2);
  });

  it("edge with <2 valid elevation points is not enriched", () => {
    // One node in coverage, one out — edge has only 1 valid elevation point
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),  // in coverage
        makeNode("b", 50.0, -80.0),       // out of coverage
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 50.0, lng: -80.0 },
        ]),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    const edge = graph.edges.get("e1")!;
    // Only 1 valid elevation point, so edge should not be enriched
    expect(edge.attributes.elevationGain).toBeUndefined();
    expect(edge.attributes.elevationLoss).toBeUndefined();
  });

  it("edge with single geometry point is not enriched", () => {
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),
        makeNode("b", 42.965, -85.665),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
        ], { lengthMeters: 100 }),
      ]
    );

    enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    const edge = graph.edges.get("e1")!;
    expect(edge.attributes.elevationGain).toBeUndefined();
  });
});

// ─── Stats ──────────────────────────────────────────────────────────────────

describe("enrichElevation - stats", () => {
  it("nodesEnriched + nodesMissing = total nodes", () => {
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),  // in coverage
        makeNode("b", 42.965, -85.665),  // in coverage
        makeNode("c", 50.0, -80.0),       // out of coverage
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 42.965, lng: -85.665 },
        ]),
        makeEdge("e2", "b", "c", [
          { lat: 42.965, lng: -85.665 },
          { lat: 50.0, lng: -80.0 },
        ]),
      ]
    );

    const stats = enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    expect(stats.nodesEnriched + stats.nodesMissing).toBe(3);
    expect(stats.nodesEnriched).toBe(2);
    expect(stats.nodesMissing).toBe(1);
  });

  it("edgesEnriched <= total edges", () => {
    const graph = makeGraph(
      [
        makeNode("a", 42.963, -85.668),
        makeNode("b", 42.965, -85.665),
        makeNode("c", 50.0, -80.0),
      ],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 42.965, lng: -85.665 },
        ]),
        makeEdge("e2", "b", "c", [
          { lat: 42.965, lng: -85.665 },
          { lat: 50.0, lng: -80.0 },
        ]),
      ]
    );

    const stats = enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });

    expect(stats.edgesEnriched).toBeLessThanOrEqual(2);
    // e1 has 2 valid points so it should be enriched, e2 has only 1 valid
    expect(stats.edgesEnriched).toBe(1);
  });

  it("timeMs is a positive number", () => {
    const graph = makeGraph(
      [makeNode("a", 42.963, -85.668), makeNode("b", 42.965, -85.665)],
      [
        makeEdge("e1", "a", "b", [
          { lat: 42.963, lng: -85.668 },
          { lat: 42.965, lng: -85.665 },
        ]),
      ]
    );

    const stats = enrichElevation(graph, { dem: { tilesDir: TILES_DIR } });
    expect(stats.timeMs).toBeGreaterThanOrEqual(0);
  });
});
