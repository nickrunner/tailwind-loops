import { describe, it, expect } from "vitest";
import {
  getEffectiveMinLength,
  chainHomogeneity,
} from "./chain-classification.js";
import { nameConsistency } from "./corridor-attributes.js";
import type { EdgeChain } from "./chain-builder.js";
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
    attributes: makeAttributes({ lengthMeters: 100, ...attrs }),
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

function makeChain(edgeIds: string[], graph: Graph): EdgeChain {
  const firstEdge = graph.edges.get(edgeIds[0]!)!;
  const lastEdge = graph.edges.get(edgeIds[edgeIds.length - 1]!)!;
  let totalLength = 0;
  for (const id of edgeIds) {
    totalLength += graph.edges.get(id)!.attributes.lengthMeters;
  }
  return {
    edgeIds,
    startNodeId: firstEdge.fromNodeId,
    endNodeId: lastEdge.toNodeId,
    totalLengthMeters: totalLength,
  };
}

// ─── nameConsistency ────────────────────────────────────────────────────────

describe("nameConsistency", () => {
  it("returns 0 for all unnamed edges", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001)],
      [makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }])]
    );
    expect(nameConsistency(["e1"], graph)).toBe(0);
  });

  it("returns 1.0 when all edges share the same name", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          name: "Trail",
          lengthMeters: 100,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          name: "Trail",
          lengthMeters: 100,
        }),
      ]
    );
    expect(nameConsistency(["e1", "e2"], graph)).toBe(1.0);
  });

  it("returns fraction for mixed names", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          name: "Main St",
          lengthMeters: 300,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          name: "Oak Ave",
          lengthMeters: 100,
        }),
      ]
    );
    // "Main St" covers 300 of 400 total = 0.75
    expect(nameConsistency(["e1", "e2"], graph)).toBeCloseTo(0.75, 5);
  });

  it("returns fraction when some edges are unnamed", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          name: "Trail",
          lengthMeters: 200,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          lengthMeters: 200,
        }),
      ]
    );
    // "Trail" covers 200 of 400 total = 0.5
    expect(nameConsistency(["e1", "e2"], graph)).toBeCloseTo(0.5, 5);
  });
});

// ─── chainHomogeneity ───────────────────────────────────────────────────────

describe("chainHomogeneity", () => {
  it("returns 1.0 for a single edge", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001)],
      [makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }])]
    );
    expect(chainHomogeneity(["e1"], graph)).toBe(1.0);
  });

  it("returns 1.0 for identical consecutive edges", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          name: "Main St",
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          name: "Main St",
        }),
      ]
    );
    expect(chainHomogeneity(["e1", "e2"], graph)).toBeCloseTo(1.0, 5);
  });

  it("returns lower score for edges with different attributes", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 0, 0.001), makeNode("c", 0, 0.002)],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          name: "Main St",
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          name: "Oak Ave",
          infrastructure: {
            hasBicycleInfra: false,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: false,
            hasTrafficCalming: false,
          },
        }),
      ]
    );
    const score = chainHomogeneity(["e1", "e2"], graph);
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0);
  });

  it("averages across multiple pairs", () => {
    // 3 edges: e1-e2 identical, e2-e3 slightly different
    const graph = makeGraph(
      [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
        makeNode("d", 0, 0.003),
      ],
      [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          name: "Main St",
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          name: "Main St",
        }),
        makeEdge("e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], {
          name: "Oak Ave",
        }),
      ]
    );
    const score = chainHomogeneity(["e1", "e2", "e3"], graph);
    // e1-e2 = 1.0, e2-e3 < 1.0 (name change), average is between
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0.5);
  });
});

// ─── getEffectiveMinLength: tier selection ──────────────────────────────────

describe("getEffectiveMinLength", () => {
  describe("tier selection", () => {
    it("uses dedicatedInfra threshold for separated cycleway", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1", "e2"], graph);

      const minLen = getEffectiveMinLength(chain, graph);
      // Default dedicatedInfra = 400m, no name bonus (unnamed), homogeneity ~1.0
      expect(minLen).toBe(400);
    });

    it("uses namedBikeInfra threshold for named road with bike infra", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          roadClass: "residential",
          lengthMeters: 100,
          name: "Bike Blvd",
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: false,
            hasTrafficCalming: false,
          },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          roadClass: "residential",
          lengthMeters: 100,
          name: "Bike Blvd",
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: false,
            hasTrafficCalming: false,
          },
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1", "e2"], graph);

      const minLen = getEffectiveMinLength(chain, graph);
      // namedBikeInfra = 800m, name consistency = 1.0 → bonus halves to 400m
      expect(minLen).toBe(400);
    });

    it("uses namedRoad threshold for named residential", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          roadClass: "residential",
          lengthMeters: 100,
          name: "Elm Street",
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          roadClass: "residential",
          lengthMeters: 100,
          name: "Elm Street",
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1", "e2"], graph);

      const minLen = getEffectiveMinLength(chain, graph);
      // namedRoad = 1609m (same as unnamed), name consistency = 1.0 → bonus halves to 804.5m
      expect(minLen).toBeCloseTo(804.5, 1);
    });

    it("uses unnamed threshold for unnamed residential", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          roadClass: "residential",
          lengthMeters: 100,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          roadClass: "residential",
          lengthMeters: 100,
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1", "e2"], graph);

      const minLen = getEffectiveMinLength(chain, graph);
      // Default unnamed = 1609m, no name bonus, homogeneity ~1.0
      expect(minLen).toBe(1609);
    });
  });

  describe("name continuity bonus", () => {
    it("halves threshold when name covers >= 80% of length", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
        makeNode("d", 0, 0.003),
        makeNode("e", 0, 0.004),
        makeNode("f", 0, 0.005),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          name: "Lakefront Trail",
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          name: "Lakefront Trail",
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
        makeEdge("e3", "c", "d", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }], {
          name: "Lakefront Trail",
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
        makeEdge("e4", "d", "e", [{ lat: 0, lng: 0.003 }, { lat: 0, lng: 0.004 }], {
          name: "Lakefront Trail",
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
        makeEdge("e5", "e", "f", [{ lat: 0, lng: 0.004 }, { lat: 0, lng: 0.005 }], {
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1", "e2", "e3", "e4", "e5"], graph);

      // Name covers 400/500 = 80% → bonus applies
      const minLen = getEffectiveMinLength(chain, graph);
      // dedicatedInfra = 400, halved = 200
      expect(minLen).toBe(200);
    });

    it("does not apply bonus when name covers < 80%", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          name: "Trail",
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          roadClass: "cycleway",
          lengthMeters: 200,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1", "e2"], graph);

      // Name covers 100/300 = 33% → no bonus
      const minLen = getEffectiveMinLength(chain, graph);
      expect(minLen).toBe(400);
    });
  });

  describe("homogeneity penalty", () => {
    it("inflates threshold for low homogeneity chain", () => {
      // Two edges in the same road class group but with differing attributes
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          roadClass: "residential",
          lengthMeters: 100,
          name: "A St",
          surfaceClassification: {
            surface: "paved",
            confidence: 0.9,
            hasConflict: false,
          },
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: true,
            hasShoulder: true,
            isSeparated: true,
            hasTrafficCalming: true,
          },
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          roadClass: "service",
          lengthMeters: 100,
          name: "B Ave",
          surfaceClassification: {
            surface: "unpaved",
            confidence: 0.5,
            hasConflict: false,
          },
          infrastructure: {
            hasBicycleInfra: false,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: false,
            hasTrafficCalming: false,
          },
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1", "e2"], graph);

      const homogeneity = chainHomogeneity(chain.edgeIds, graph);
      expect(homogeneity).toBeLessThan(0.7);

      const minLen = getEffectiveMinLength(chain, graph);
      // unnamed tier (50% named, split names) = 1609
      // homogeneity penalty: 1609 * (1 / homogeneity) > 1609
      expect(minLen).toBeGreaterThan(1609);
    });

    it("does not penalize high homogeneity chain", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          roadClass: "residential",
          lengthMeters: 100,
        }),
        makeEdge("e2", "b", "c", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }], {
          roadClass: "residential",
          lengthMeters: 100,
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1", "e2"], graph);

      const minLen = getEffectiveMinLength(chain, graph);
      // unnamed tier = 1609, no penalty (homogeneity ~1.0)
      expect(minLen).toBe(1609);
    });
  });

  describe("custom options", () => {
    it("respects custom minLengthByTier", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          roadClass: "cycleway",
          lengthMeters: 100,
          infrastructure: {
            hasBicycleInfra: true,
            hasPedestrianPath: false,
            hasShoulder: false,
            isSeparated: true,
            hasTrafficCalming: false,
          },
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1"], graph);

      const minLen = getEffectiveMinLength(chain, graph, {
        minLengthByTier: { dedicatedInfra: 500 },
      });
      expect(minLen).toBe(500);
    });

    it("uses minLengthMeters as unnamed fallback when minLengthByTier not set", () => {
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
      ];
      const edges = [
        makeEdge("e1", "a", "b", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], {
          roadClass: "residential",
          lengthMeters: 100,
        }),
      ];
      const graph = makeGraph(nodes, edges);
      const chain = makeChain(["e1"], graph);

      const minLen = getEffectiveMinLength(chain, graph, {
        minLengthMeters: 500,
      });
      expect(minLen).toBe(500);
    });
  });
});
