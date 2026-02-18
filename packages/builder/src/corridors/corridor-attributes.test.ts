import { describe, it, expect } from "vitest";
import {
  aggregateAttributes,
  deriveName,
  buildCorridorGeometry,
  douglasPeucker,
} from "./corridor-attributes.js";
import type {
  Graph,
  GraphEdge,
  GraphNode,
  EdgeAttributes,
  Coordinate,
} from "@tailwind-loops/types";

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

// ─── aggregateAttributes ─────────────────────────────────────────────────────

describe("aggregateAttributes", () => {
  it("sums total length from all edges", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], { lengthMeters: 150 }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], { lengthMeters: 250 }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.lengthMeters).toBe(400);
  });

  it("picks predominant road class weighted by length", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 300,
          roadClass: "cycleway",
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 100,
          roadClass: "residential",
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.predominantRoadClass).toBe("cycleway");
  });

  it("picks predominant surface weighted by length", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 50,
          surfaceClassification: { surface: "unpaved", confidence: 0.7, observations: [], hasConflict: false },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 200,
          surfaceClassification: { surface: "paved", confidence: 0.9, observations: [], hasConflict: false },
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.predominantSurface).toBe("paved");
  });

  it("computes length-weighted surface confidence", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
          surfaceClassification: { surface: "paved", confidence: 0.6, observations: [], hasConflict: false },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 100,
          surfaceClassification: { surface: "paved", confidence: 1.0, observations: [], hasConflict: false },
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.surfaceConfidence).toBeCloseTo(0.8, 5);
  });

  it("computes infrastructure continuity", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 300,
          infrastructure: { hasBicycleInfra: true, hasPedestrianPath: false, hasShoulder: false, isSeparated: false, hasTrafficCalming: false },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 100,
          infrastructure: { hasBicycleInfra: false, hasPedestrianPath: false, hasShoulder: false, isSeparated: false, hasTrafficCalming: false },
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.bicycleInfraContinuity).toBeCloseTo(0.75, 5);
  });

  it("computes separation continuity", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 200,
          infrastructure: { hasBicycleInfra: false, hasPedestrianPath: false, hasShoulder: false, isSeparated: true, hasTrafficCalming: false },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 200,
          infrastructure: { hasBicycleInfra: false, hasPedestrianPath: false, hasShoulder: false, isSeparated: true, hasTrafficCalming: false },
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.separationContinuity).toBe(1.0);
  });

  it("computes length-weighted average speed limit (only defined edges)", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002), makeNode("d", 0, 0.003)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
          speedLimit: 30,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 100,
          speedLimit: 50,
        }),
        makeEdge("e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], {
          lengthMeters: 200,
          // no speedLimit
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2", "e3"], graph);
    // Only e1 and e2 have speed limits: (30*100 + 50*100) / 200 = 40
    expect(attrs.averageSpeedLimit).toBe(40);
  });

  it("returns undefined averageSpeedLimit when no edges have speed limits", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1"], graph);
    expect(attrs.averageSpeedLimit).toBeUndefined();
  });

  it("sets stopDensityPerKm to 0 when no stops present", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001)],
      [makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }])]
    );

    const attrs = aggregateAttributes(["e1"], graph);
    expect(attrs.stopDensityPerKm).toBe(0);
  });

  it("computes stopDensityPerKm from edge stopSignCount", () => {
    const nodeA = makeNode("a", 42.96, -85.66);
    const nodeB = makeNode("b", 42.965, -85.66);
    const nodeC = makeNode("c", 42.97, -85.66);
    const graph = makeGraph(
      [nodeA, nodeB, nodeC],
      [
        makeEdge("e1", "a", "b", [nodeA.coordinate, nodeB.coordinate], { lengthMeters: 500, stopSignCount: 1 }),
        makeEdge("e2", "b", "c", [nodeB.coordinate, nodeC.coordinate], { lengthMeters: 500 }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    // 1 stop over 1km = 1.0 per km
    expect(attrs.stopDensityPerKm).toBe(1.0);
  });

  it("computes stopDensityPerKm from edge trafficSignalCount", () => {
    const nodeA = makeNode("a", 42.96, -85.66);
    const nodeB = makeNode("b", 42.965, -85.66);
    const nodeC = makeNode("c", 42.97, -85.66);
    const graph = makeGraph(
      [nodeA, nodeB, nodeC],
      [
        makeEdge("e1", "a", "b", [nodeA.coordinate, nodeB.coordinate], { lengthMeters: 500, trafficSignalCount: 2 }),
        makeEdge("e2", "b", "c", [nodeB.coordinate, nodeC.coordinate], { lengthMeters: 500 }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    // 2 signals over 1km = 2.0 per km
    expect(attrs.stopDensityPerKm).toBe(2.0);
  });

  it("sums stop controls across multiple edges", () => {
    const nodeA = makeNode("a", 42.96, -85.66);
    const nodeB = makeNode("b", 42.965, -85.66);
    const nodeC = makeNode("c", 42.97, -85.66);
    const graph = makeGraph(
      [nodeA, nodeB, nodeC],
      [
        makeEdge("e1", "a", "b", [nodeA.coordinate, nodeB.coordinate], { lengthMeters: 500, stopSignCount: 1 }),
        makeEdge("e2", "b", "c", [nodeB.coordinate, nodeC.coordinate], { lengthMeters: 500, trafficSignalCount: 1 }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    // 2 total controls over 1km = 2.0 per km
    expect(attrs.stopDensityPerKm).toBe(2.0);
  });

  it("computes crossingDensityPerKm from graph node degrees", () => {
    // Simulates a bidirectional graph (like real OSM data) with a T-intersection at node b.
    // Corridor goes a→b→c (1km total). Node b also has edges to/from d (cross-street).
    // In real OSM model, a through-node has 2 outgoing (forward + reverse),
    // a T-intersection has 3 outgoing.
    const nodes = [
      makeNode("a", 42.96, -85.66),
      makeNode("b", 42.965, -85.66),
      makeNode("c", 42.97, -85.66),
      makeNode("d", 42.965, -85.659),
    ];
    const edges = [
      // Main corridor (forward direction)
      makeEdge("e1:f", "a", "b", [nodes[0]!.coordinate, nodes[1]!.coordinate], { lengthMeters: 500 }),
      makeEdge("e2:f", "b", "c", [nodes[1]!.coordinate, nodes[2]!.coordinate], { lengthMeters: 500 }),
      // Reverse edges for main corridor
      makeEdge("e1:r", "b", "a", [nodes[1]!.coordinate, nodes[0]!.coordinate], { lengthMeters: 500 }),
      makeEdge("e2:r", "c", "b", [nodes[2]!.coordinate, nodes[1]!.coordinate], { lengthMeters: 500 }),
      // Cross-street at b
      makeEdge("e3:f", "b", "d", [nodes[1]!.coordinate, nodes[3]!.coordinate], { lengthMeters: 100 }),
      makeEdge("e3:r", "d", "b", [nodes[3]!.coordinate, nodes[1]!.coordinate], { lengthMeters: 100 }),
    ];
    const graph = makeGraph(nodes, edges);

    const attrs = aggregateAttributes(["e1:f", "e2:f"], graph);
    // Node a: outgoing = [e1:f] = 1 (not intersection)
    // Node b: outgoing = [e2:f, e1:r, e3:f] = 3 (intersection!)
    // Node c: outgoing = [e2:r] = 1 (not intersection)
    // 1 intersection over 1km = 1.0 per km
    expect(attrs.crossingDensityPerKm).toBe(1.0);
  });

  it("returns 0 crossingDensityPerKm when no intersections exist", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001)],
      [makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }])]
    );

    const attrs = aggregateAttributes(["e1"], graph);
    expect(attrs.crossingDensityPerKm).toBe(0);
  });

  it("counts turns above 30 degrees between consecutive edges", () => {
    // Three edges: first goes east, second turns sharply north (90°), third continues north (0°)
    const graph = makeGraph(
      [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0.001, 0.001),
        makeNode("d", 0.002, 0.001),
      ],
      [
        // East
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
        // North (90° turn)
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.001 }]),
        // Continue north (0° turn)
        makeEdge("e3", "c", "d", [{ lat: 0.001, lng: 0.001 }, { lat: 0.002, lng: 0.001 }]),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2", "e3"], graph);
    // Only the e1→e2 transition is > 30°
    expect(attrs.turnsCount).toBe(1);
  });
});

// ─── deriveName ──────────────────────────────────────────────────────────────

describe("deriveName", () => {
  it("picks the name with the most total length", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 300,
          name: "Main Street",
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 100,
          name: "Oak Avenue",
        }),
      ]
    );

    expect(deriveName(["e1", "e2"], graph)).toBe("Main Street");
  });

  it("returns undefined when all edges are unnamed", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001)],
      [makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }])]
    );

    expect(deriveName(["e1"], graph)).toBeUndefined();
  });

  it("ignores unnamed edges when computing predominant name", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 500,
          // no name
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 50,
          name: "Elm Street",
        }),
      ]
    );

    expect(deriveName(["e1", "e2"], graph)).toBe("Elm Street");
  });
});

// ─── buildCorridorGeometry ───────────────────────────────────────────────────

describe("buildCorridorGeometry", () => {
  it("concatenates edge geometries and removes duplicate junction points", () => {
    // Each edge has a unique off-line deviation point so nothing gets simplified
    // Edge 1: (0,0) → detour northeast → (0.02, 0.04)
    // Edge 2: (0.02, 0.04) → detour southeast → (0, 0.08)
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0.02, 0.04), makeNode("c", 0, 0.08)],
      [
        makeEdge("e1", "a", "b", [
          { lat: 0, lng: 0 },
          { lat: 0.03, lng: 0.02 }, // off-line point (deviates from start→end)
          { lat: 0.02, lng: 0.04 },
        ]),
        makeEdge("e2", "b", "c", [
          { lat: 0.02, lng: 0.04 }, // duplicate of e1's last point
          { lat: -0.01, lng: 0.06 }, // off-line point (deviates from start→end)
          { lat: 0, lng: 0.08 },
        ]),
      ]
    );

    // Tolerance 100m — all off-line points deviate by several km, so all are kept
    const geom = buildCorridorGeometry(["e1", "e2"], graph, 100);
    // 6 raw points - 1 junction duplicate = 5 points
    // All off-line points deviate well beyond 100m so DP keeps them all
    expect(geom).toHaveLength(5);
    expect(geom[0]).toEqual({ lat: 0, lng: 0 });
    expect(geom[2]).toEqual({ lat: 0.02, lng: 0.04 }); // junction point
    expect(geom[4]).toEqual({ lat: 0, lng: 0.08 });
  });

  it("returns empty array for no edges", () => {
    const graph = makeGraph([], []);
    expect(buildCorridorGeometry([], graph)).toEqual([]);
  });

  it("preserves start and end points after simplification", () => {
    // Create a nearly straight line with one slight detour
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.01)],
      [
        makeEdge("e1", "a", "b", [
          { lat: 0, lng: 0 },
          { lat: 0.000001, lng: 0.002 }, // Nearly on the line
          { lat: 0.000001, lng: 0.005 }, // Nearly on the line
          { lat: 0, lng: 0.01 },
        ]),
      ]
    );

    const geom = buildCorridorGeometry(["e1"], graph, 10);
    expect(geom[0]).toEqual({ lat: 0, lng: 0 });
    expect(geom[geom.length - 1]).toEqual({ lat: 0, lng: 0.01 });
  });

  it("simplifies points within tolerance", () => {
    // Straight line with intermediate points very close to the line
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.01)],
      [
        makeEdge("e1", "a", "b", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.003 }, // Exactly on the line
          { lat: 0, lng: 0.006 }, // Exactly on the line
          { lat: 0, lng: 0.01 },
        ]),
      ]
    );

    const geom = buildCorridorGeometry(["e1"], graph, 10);
    // Points on the line should be removed
    expect(geom).toHaveLength(2);
  });

  it("keeps points that deviate beyond tolerance", () => {
    // Line with a significant detour
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [
          { lat: 0, lng: 0 },
          { lat: 0.001, lng: 0.001 }, // ~111m off the line - well beyond 10m tolerance
          { lat: 0, lng: 0.002 },
        ]),
      ]
    );

    const geom = buildCorridorGeometry(["e1"], graph, 10);
    expect(geom).toHaveLength(3);
  });
});

// ─── douglasPeucker ──────────────────────────────────────────────────────────

describe("douglasPeucker", () => {
  it("preserves two-point lines", () => {
    const result = douglasPeucker(
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      10
    );
    expect(result).toHaveLength(2);
  });

  it("removes collinear intermediate points", () => {
    const result = douglasPeucker(
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.001 },
        { lat: 0, lng: 0.002 },
        { lat: 0, lng: 0.003 },
      ],
      10
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ lat: 0, lng: 0 });
    expect(result[1]).toEqual({ lat: 0, lng: 0.003 });
  });

  it("keeps sharp corners", () => {
    // V-shape: big detour in the middle
    const result = douglasPeucker(
      [
        { lat: 0, lng: 0 },
        { lat: 0.01, lng: 0.005 }, // ~1.1 km off line
        { lat: 0, lng: 0.01 },
      ],
      10
    );
    expect(result).toHaveLength(3);
  });

  it("returns copy for single point", () => {
    const result = douglasPeucker([{ lat: 0, lng: 0 }], 10);
    expect(result).toHaveLength(1);
  });
});

// ─── Elevation aggregation ──────────────────────────────────────────────────

describe("aggregateAttributes - elevation", () => {
  it("accumulates elevation gain across edges", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
          elevationGain: 10,
          elevationLoss: 5,
          averageGrade: 3,
          maxGrade: 4,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 100,
          elevationGain: 15,
          elevationLoss: 8,
          averageGrade: 6,
          maxGrade: 8,
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.totalElevationGain).toBe(25);
  });

  it("accumulates elevation loss across edges", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
          elevationGain: 10,
          elevationLoss: 5,
          averageGrade: 3,
          maxGrade: 4,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 100,
          elevationGain: 15,
          elevationLoss: 8,
          averageGrade: 6,
          maxGrade: 8,
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.totalElevationLoss).toBe(13);
  });

  it("computes length-weighted average grade", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
          elevationGain: 3,
          elevationLoss: 0,
          averageGrade: 3,
          maxGrade: 4,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 200,
          elevationGain: 12,
          elevationLoss: 0,
          averageGrade: 6,
          maxGrade: 8,
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    // averageGrade = (|3|*100 + |6|*200) / 300 = 1500/300 = 5
    expect(attrs.averageGrade).toBeCloseTo(5, 5);
  });

  it("picks max grade across edges", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
          elevationGain: 5,
          elevationLoss: 0,
          averageGrade: 3,
          maxGrade: 4,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 100,
          elevationGain: 10,
          elevationLoss: 0,
          averageGrade: 6,
          maxGrade: 8,
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.maxGrade).toBe(8);
  });

  it("returns undefined elevation fields when no edges have elevation data", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
          // no elevation fields
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1"], graph);
    expect(attrs.totalElevationGain).toBeUndefined();
    expect(attrs.totalElevationLoss).toBeUndefined();
    expect(attrs.averageGrade).toBeUndefined();
    expect(attrs.maxGrade).toBeUndefined();
    expect(attrs.hillinessIndex).toBeUndefined();
    expect(attrs.elevationProfile).toBeUndefined();
  });

  it("only edges with elevation data contribute to averages (mixed)", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          lengthMeters: 100,
          elevationGain: 10,
          elevationLoss: 5,
          averageGrade: 4,
          maxGrade: 6,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 200,
          // no elevation data
        }),
      ]
    );

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    // Only e1 has elevation data
    expect(attrs.totalElevationGain).toBe(10);
    expect(attrs.totalElevationLoss).toBe(5);
    // averageGrade weighted only by e1's length (100m)
    expect(attrs.averageGrade).toBeCloseTo(4, 5);
    expect(attrs.maxGrade).toBe(6);
  });

  it("flat corridor has hillinessIndex near 0", () => {
    // Build a corridor of 1km with ~0 gain and 0 grade variance
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
      makeNode("c", 0, 0.002),
      makeNode("d", 0, 0.003),
    ];
    // Set elevationMeters on nodes for profile building
    nodes[0]!.elevationMeters = 200;
    nodes[1]!.elevationMeters = 200;
    nodes[2]!.elevationMeters = 200;
    nodes[3]!.elevationMeters = 200;

    const graph = makeGraph(nodes, [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
        lengthMeters: 333,
        elevationGain: 0,
        elevationLoss: 0,
        averageGrade: 0,
        maxGrade: 0,
      }),
      makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
        lengthMeters: 333,
        elevationGain: 0,
        elevationLoss: 0,
        averageGrade: 0,
        maxGrade: 0,
      }),
      makeEdge("e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], {
        lengthMeters: 334,
        elevationGain: 0,
        elevationLoss: 0,
        averageGrade: 0,
        maxGrade: 0,
      }),
    ]);

    const attrs = aggregateAttributes(["e1", "e2", "e3"], graph);
    expect(attrs.hillinessIndex).toBeDefined();
    expect(attrs.hillinessIndex!).toBeCloseTo(0, 1);
  });

  it("hilly corridor has hillinessIndex closer to 1", () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
      makeNode("c", 0, 0.002),
    ];
    nodes[0]!.elevationMeters = 200;
    nodes[1]!.elevationMeters = 300;
    nodes[2]!.elevationMeters = 220;

    const graph = makeGraph(nodes, [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
        lengthMeters: 500,
        elevationGain: 100,
        elevationLoss: 0,
        averageGrade: 20,
        maxGrade: 20,
      }),
      makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
        lengthMeters: 500,
        elevationGain: 0,
        elevationLoss: 80,
        averageGrade: -16,
        maxGrade: 16,
      }),
    ]);

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.hillinessIndex).toBeDefined();
    // undulation = (100 + 80) / 2 = 90m over 1km = 90/km
    // gain component: 0.7 * min(1, 90/100) = 0.63
    // grade stddev > 0 (edges have different grades) → adds to hilliness
    expect(attrs.hillinessIndex!).toBeGreaterThanOrEqual(0.5);
  });

  it("elevation profile is populated when nodes have elevationMeters", () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
      makeNode("c", 0, 0.002),
    ];
    nodes[0]!.elevationMeters = 200;
    nodes[1]!.elevationMeters = 210;
    nodes[2]!.elevationMeters = 205;

    const graph = makeGraph(nodes, [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
        lengthMeters: 100,
        elevationGain: 10,
        elevationLoss: 0,
        averageGrade: 10,
        maxGrade: 10,
      }),
      makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
        lengthMeters: 100,
        elevationGain: 0,
        elevationLoss: 5,
        averageGrade: -5,
        maxGrade: 5,
      }),
    ]);

    const attrs = aggregateAttributes(["e1", "e2"], graph);
    expect(attrs.elevationProfile).toBeDefined();
    expect(attrs.elevationProfile!.length).toBeGreaterThan(0);
    // Profile should start near 200 and contain values in the 200-210 range
    expect(attrs.elevationProfile![0]).toBeCloseTo(200, 0);
  });

  it("elevation profile length ≈ totalLength / interval + 1", () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 0, 0.001),
    ];
    nodes[0]!.elevationMeters = 200;
    nodes[1]!.elevationMeters = 210;

    const graph = makeGraph(nodes, [
      makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
        lengthMeters: 200,
        elevationGain: 10,
        elevationLoss: 0,
        averageGrade: 5,
        maxGrade: 5,
      }),
    ]);

    const attrs = aggregateAttributes(["e1"], graph);
    expect(attrs.elevationProfile).toBeDefined();
    // 200m / 50m interval ≈ 4 + 1 = 5 points (approximately)
    // The profile uses haversine distance which differs from the set lengthMeters,
    // so we just check it's in a reasonable range
    expect(attrs.elevationProfile!.length).toBeGreaterThanOrEqual(2);
    expect(attrs.elevationProfile!.length).toBeLessThanOrEqual(10);
  });
});
