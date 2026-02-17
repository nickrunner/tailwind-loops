import { describe, it, expect } from "vitest";
import { buildChains } from "./chain-builder.js";
import type { EdgeChain } from "./chain-builder.js";
import type {
  Graph,
  GraphEdge,
  GraphNode,
  EdgeAttributes,
  Coordinate,
} from "../domain/graph.js";

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
    attributes: makeAttributes({ lengthMeters: 100, ...attrs }),
  };
}

/**
 * Build a Graph from arrays of nodes and edges.
 * Automatically builds the adjacency map from edges.
 */
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

/** Collect all edgeIds across all chains */
function allEdgeIds(chains: EdgeChain[]): string[] {
  return chains.flatMap((c) => c.edgeIds);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("buildChains", () => {
  describe("basic chain building", () => {
    it("creates a single chain for a straight road", () => {
      // A -- B -- C -- D  (3 edges, all same attributes, straight line)
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
        makeNode("D", 0, 0.003),
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ]),
        makeEdge("e3", "C", "D", [
          { lat: 0, lng: 0.002 },
          { lat: 0, lng: 0.003 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      expect(chains).toHaveLength(1);
      expect(chains[0]!.edgeIds).toEqual(["e1", "e2", "e3"]);
      expect(chains[0]!.startNodeId).toBe("A");
      expect(chains[0]!.endNodeId).toBe("D");
      expect(chains[0]!.totalLengthMeters).toBe(300);
    });

    it("creates separate chains for incompatible edges", () => {
      // A -- B -- C  where e1 is residential, e2 is cycleway (different group)
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
      ];
      const edges = [
        makeEdge(
          "e1",
          "A",
          "B",
          [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.001 },
          ],
          { roadClass: "residential" }
        ),
        makeEdge(
          "e2",
          "B",
          "C",
          [
            { lat: 0, lng: 0.001 },
            { lat: 0, lng: 0.002 },
          ],
          { roadClass: "cycleway" }
        ),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      expect(chains).toHaveLength(2);
      // Each chain has exactly one edge
      const ids = allEdgeIds(chains);
      expect(ids).toContain("e1");
      expect(ids).toContain("e2");
    });
  });

  describe("every edge in exactly one chain", () => {
    it("no orphans and no duplicates", () => {
      // Build a small network with varied edges
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
        makeNode("D", 0.001, 0.001),
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ]),
        makeEdge("e3", "B", "D", [
          { lat: 0, lng: 0.001 },
          { lat: 0.001, lng: 0.001 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      const ids = allEdgeIds(chains);
      // Every edge is present
      expect(ids.sort()).toEqual(["e1", "e2", "e3"].sort());
      // No duplicates
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("handles a single isolated edge", () => {
      const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.001)];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      expect(chains).toHaveLength(1);
      expect(chains[0]!.edgeIds).toEqual(["e1"]);
    });
  });

  describe("T-intersections", () => {
    it("picks best compatible continuation at T-intersection", () => {
      //    D
      //    |
      // A--B--C
      // e1 is A->B (residential, east), e2 is B->C (residential, east), e3 is B->D (residential, north)
      // e1 and e2 are straight continuation; e3 is a 90° turn
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
        makeNode("D", 0.001, 0.001),
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ]),
        makeEdge("e3", "B", "D", [
          { lat: 0, lng: 0.001 },
          { lat: 0.001, lng: 0.001 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);

      // With default maxAngleChange=45, the 90° turn to D should be rejected
      const chains = buildChains(graph);

      // e1 and e2 should be in the same chain (straight continuation)
      const straightChain = chains.find(
        (c) => c.edgeIds.includes("e1") && c.edgeIds.includes("e2")
      );
      expect(straightChain).toBeDefined();

      // e3 should be in its own chain
      const sideChain = chains.find((c) => c.edgeIds.includes("e3"));
      expect(sideChain).toBeDefined();
      expect(sideChain!.edgeIds).toHaveLength(1);
    });
  });

  describe("dead ends", () => {
    it("handles dead-end streets (chain just stops)", () => {
      // A -- B -- C (dead end at C, no outgoing edges)
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      expect(chains).toHaveLength(1);
      expect(chains[0]!.edgeIds).toEqual(["e1", "e2"]);
      expect(chains[0]!.endNodeId).toBe("C");
    });
  });

  describe("different road types meeting", () => {
    it("splits chain where road type changes group", () => {
      // A residential road transitions to a cycleway
      // A --(res)--> B --(cyc)--> C --(cyc)--> D
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
        makeNode("D", 0, 0.003),
      ];
      const edges = [
        makeEdge(
          "e1",
          "A",
          "B",
          [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.001 },
          ],
          { roadClass: "residential" }
        ),
        makeEdge(
          "e2",
          "B",
          "C",
          [
            { lat: 0, lng: 0.001 },
            { lat: 0, lng: 0.002 },
          ],
          { roadClass: "cycleway" }
        ),
        makeEdge(
          "e3",
          "C",
          "D",
          [
            { lat: 0, lng: 0.002 },
            { lat: 0, lng: 0.003 },
          ],
          { roadClass: "cycleway" }
        ),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      // e1 (residential) should be separate from e2+e3 (cycleway)
      expect(chains).toHaveLength(2);
      const resChain = chains.find((c) => c.edgeIds.includes("e1"));
      const cycChain = chains.find((c) => c.edgeIds.includes("e2"));
      expect(resChain!.edgeIds).toEqual(["e1"]);
      expect(cycChain!.edgeIds).toContain("e2");
      expect(cycChain!.edgeIds).toContain("e3");
    });
  });

  describe("angle constraints", () => {
    it("stops chain when angle change exceeds maxAngleChange", () => {
      // A -> B going east, B -> C going north (90° turn)
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0.001, 0.001),
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0, lng: 0.001 },
          { lat: 0.001, lng: 0.001 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);

      // Default maxAngleChange is 45°, so 90° turn should break the chain
      const chains = buildChains(graph);
      expect(chains).toHaveLength(2);
    });

    it("continues chain when angle is within maxAngleChange", () => {
      // A -> B -> C with slight bend (< 45°)
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0.0002, 0.002), // slight northward bend
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0, lng: 0.001 },
          { lat: 0.0002, lng: 0.002 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);
      expect(chains).toHaveLength(1);
      expect(chains[0]!.edgeIds).toEqual(["e1", "e2"]);
    });

    it("respects custom maxAngleChange option", () => {
      // 90° turn - rejected at default 45° but accepted at 100°
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0.001, 0.001),
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0, lng: 0.001 },
          { lat: 0.001, lng: 0.001 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph, { maxAngleChange: 100 });
      expect(chains).toHaveLength(1);
    });
  });

  describe("one-way streets", () => {
    it("handles one-way edges correctly (no backward extension into wrong direction)", () => {
      // A -> B -> C all one-way eastbound
      // Chain should still form since backward extension uses reverse adjacency (edges ending at node)
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
      ];
      const edges = [
        makeEdge(
          "e1",
          "A",
          "B",
          [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.001 },
          ],
          { oneWay: true }
        ),
        makeEdge(
          "e2",
          "B",
          "C",
          [
            { lat: 0, lng: 0.001 },
            { lat: 0, lng: 0.002 },
          ],
          { oneWay: true }
        ),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      // Both edges should chain together
      expect(chains).toHaveLength(1);
      expect(chains[0]!.edgeIds).toEqual(["e1", "e2"]);
    });

    it("does not chain edges that flow in opposite directions through same node", () => {
      // A -> B and C -> B (both end at B, but go opposite directions)
      // These should NOT chain because backward extension looks for edges ending at fromNode,
      // and forward extension looks for edges starting at toNode
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
      ];
      const edges = [
        makeEdge(
          "e1",
          "A",
          "B",
          [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.001 },
          ],
          { oneWay: true }
        ),
        makeEdge(
          "e2",
          "C",
          "B",
          [
            { lat: 0, lng: 0.002 },
            { lat: 0, lng: 0.001 },
          ],
          { oneWay: true }
        ),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      // e1 ends at B, e2 also ends at B. They can't chain forward.
      // e1 starts at A (nothing incoming), e2 starts at C (nothing incoming).
      expect(chains).toHaveLength(2);
    });
  });

  describe("loops", () => {
    it("handles a simple loop", () => {
      // A -> B -> C -> A (triangle loop, all same attributes, gentle angles)
      // Using equilateral triangle with ~60° angles
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0.0005, 0.001),
        makeNode("C", 0, 0.002),
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0.0005, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0.0005, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ]),
        makeEdge("e3", "C", "A", [
          { lat: 0, lng: 0.002 },
          { lat: 0, lng: 0 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);

      // With high maxAngleChange to allow the triangle turns
      const chains = buildChains(graph, { maxAngleChange: 120 });

      // All edges should be accounted for
      const ids = allEdgeIds(chains);
      expect(ids.sort()).toEqual(["e1", "e2", "e3"].sort());
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("directional consistency", () => {
    it("chains maintain consistent edge ordering", () => {
      // Straight road: A -> B -> C -> D
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
        makeNode("D", 0, 0.003),
      ];
      const edges = [
        makeEdge("e1", "A", "B", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("e2", "B", "C", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ]),
        makeEdge("e3", "C", "D", [
          { lat: 0, lng: 0.002 },
          { lat: 0, lng: 0.003 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      expect(chains).toHaveLength(1);
      const chain = chains[0]!;

      // Verify that each consecutive pair of edges is connected:
      // the toNode of edge[i] should equal the fromNode of edge[i+1]
      for (let i = 0; i < chain.edgeIds.length - 1; i++) {
        const curr = graph.edges.get(chain.edgeIds[i]!)!;
        const next = graph.edges.get(chain.edgeIds[i + 1]!)!;
        expect(curr.toNodeId).toBe(next.fromNodeId);
      }
    });
  });

  describe("empty graph", () => {
    it("returns empty array for empty graph", () => {
      const graph: Graph = {
        nodes: new Map(),
        edges: new Map(),
        adjacency: new Map(),
      };
      const chains = buildChains(graph);
      expect(chains).toEqual([]);
    });
  });

  describe("complex network", () => {
    it("correctly partitions a mixed network", () => {
      // Network:
      //   A --(res)--> B --(res)--> C --(cyc)--> D --(cyc)--> E
      //                |
      //                v (res, south - 90° turn)
      //                F
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
        makeNode("D", 0, 0.003),
        makeNode("E", 0, 0.004),
        makeNode("F", -0.001, 0.001),
      ];
      const edges = [
        makeEdge(
          "e1",
          "A",
          "B",
          [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.001 },
          ],
          { roadClass: "residential" }
        ),
        makeEdge(
          "e2",
          "B",
          "C",
          [
            { lat: 0, lng: 0.001 },
            { lat: 0, lng: 0.002 },
          ],
          { roadClass: "residential" }
        ),
        makeEdge(
          "e3",
          "C",
          "D",
          [
            { lat: 0, lng: 0.002 },
            { lat: 0, lng: 0.003 },
          ],
          { roadClass: "cycleway" }
        ),
        makeEdge(
          "e4",
          "D",
          "E",
          [
            { lat: 0, lng: 0.003 },
            { lat: 0, lng: 0.004 },
          ],
          { roadClass: "cycleway" }
        ),
        makeEdge(
          "e5",
          "B",
          "F",
          [
            { lat: 0, lng: 0.001 },
            { lat: -0.001, lng: 0.001 },
          ],
          { roadClass: "residential" }
        ),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      // All 5 edges accounted for
      const ids = allEdgeIds(chains);
      expect(ids.sort()).toEqual(["e1", "e2", "e3", "e4", "e5"].sort());
      expect(new Set(ids).size).toBe(5);

      // Residential straight chain: e1 + e2
      const resChain = chains.find(
        (c) => c.edgeIds.includes("e1") && c.edgeIds.includes("e2")
      );
      expect(resChain).toBeDefined();

      // Cycleway chain: e3 + e4
      const cycChain = chains.find(
        (c) => c.edgeIds.includes("e3") && c.edgeIds.includes("e4")
      );
      expect(cycChain).toBeDefined();

      // Side street: e5 alone (90° turn from e1-e2 chain)
      const sideChain = chains.find((c) => c.edgeIds.includes("e5"));
      expect(sideChain).toBeDefined();
      expect(sideChain!.edgeIds).toHaveLength(1);
    });
  });

  describe("totalLengthMeters", () => {
    it("sums edge lengths correctly", () => {
      const nodes = [
        makeNode("A", 0, 0),
        makeNode("B", 0, 0.001),
        makeNode("C", 0, 0.002),
      ];
      const edges = [
        makeEdge(
          "e1",
          "A",
          "B",
          [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.001 },
          ],
          { lengthMeters: 150 }
        ),
        makeEdge(
          "e2",
          "B",
          "C",
          [
            { lat: 0, lng: 0.001 },
            { lat: 0, lng: 0.002 },
          ],
          { lengthMeters: 250 }
        ),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      expect(chains).toHaveLength(1);
      expect(chains[0]!.totalLengthMeters).toBe(400);
    });
  });
});
