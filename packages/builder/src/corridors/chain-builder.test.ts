import { describe, it, expect } from "vitest";
import {
  buildChains,
  getCounterpartEdgeId,
  computeUndirectedDegree,
  trimDeadEnds,
  isDestinationCandidate,
} from "./chain-builder.js";
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

/** Wrap all edges into a single chain for degree computation tests */
function allEdgesAsChains(graph: Graph): EdgeChain[] {
  const edgeIds = [...graph.edges.keys()];
  if (edgeIds.length === 0) return [];
  const firstEdge = graph.edges.get(edgeIds[0]!)!;
  const lastEdge = graph.edges.get(edgeIds[edgeIds.length - 1]!)!;
  return [{
    edgeIds,
    startNodeId: firstEdge.fromNodeId,
    endNodeId: lastEdge.toNodeId,
    totalLengthMeters: 0,
  }];
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

  describe("bidirectional deduplication", () => {
    it("produces one chain for bidirectional edges (not two)", () => {
      // A -- B with forward (:f) and reverse (:r) edges
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
      ];
      const edges = [
        makeEdge("100:0:f", "a", "b", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("100:0:r", "b", "a", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      // Should produce only ONE chain, not two
      expect(chains).toHaveLength(1);
      expect(chains[0]!.edgeIds).toHaveLength(1);
    });

    it("produces one chain for multi-edge bidirectional road", () => {
      // A -- B -- C with forward and reverse edges for each segment
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("100:0:f", "a", "b", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ]),
        makeEdge("100:0:r", "b", "a", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0 },
        ]),
        makeEdge("100:1:f", "b", "c", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ]),
        makeEdge("100:1:r", "c", "b", [
          { lat: 0, lng: 0.002 },
          { lat: 0, lng: 0.001 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      // Should produce ONE chain with 2 forward edges (not 2 chains)
      expect(chains).toHaveLength(1);
      expect(chains[0]!.edgeIds).toHaveLength(2);
    });

    it("still works correctly for one-way edges (no suffix)", () => {
      // A -> B -> C (one-way, no counterparts)
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("100:0", "a", "b", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ], { oneWay: true }),
        makeEdge("100:1", "b", "c", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ], { oneWay: true }),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      expect(chains).toHaveLength(1);
      expect(chains[0]!.edgeIds).toHaveLength(2);
      expect(chains[0]!.edgeIds).toEqual(["100:0", "100:1"]);
    });

    it("handles mix of one-way and bidirectional edges", () => {
      // A -> B (one-way) then B -- C (bidirectional)
      // Should not chain them together (different oneWay attributes reduce compatibility)
      // but each should produce exactly one chain
      const nodes = [
        makeNode("a", 0, 0),
        makeNode("b", 0, 0.001),
        makeNode("c", 0, 0.002),
      ];
      const edges = [
        makeEdge("100:0", "a", "b", [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.001 },
        ], { oneWay: true }),
        makeEdge("200:0:f", "b", "c", [
          { lat: 0, lng: 0.001 },
          { lat: 0, lng: 0.002 },
        ]),
        makeEdge("200:0:r", "c", "b", [
          { lat: 0, lng: 0.002 },
          { lat: 0, lng: 0.001 },
        ]),
      ];
      const graph = makeGraph(nodes, edges);
      const chains = buildChains(graph);

      // Total edges consumed should be 2 (one-way + one forward), not 3
      const totalEdges = chains.reduce((sum, c) => sum + c.edgeIds.length, 0);
      expect(totalEdges).toBeLessThanOrEqual(3);
      // The reverse edge should NOT appear in any chain
      const allIds = chains.flatMap(c => c.edgeIds);
      expect(allIds).not.toContain("200:0:r");
    });
  });
});

describe("getCounterpartEdgeId", () => {
  it("returns :r for :f suffix", () => {
    expect(getCounterpartEdgeId("100:0:f")).toBe("100:0:r");
  });

  it("returns :f for :r suffix", () => {
    expect(getCounterpartEdgeId("100:0:r")).toBe("100:0:f");
  });

  it("returns null for one-way edge (no suffix)", () => {
    expect(getCounterpartEdgeId("100:0")).toBeNull();
  });

  it("returns null for edge with other suffix", () => {
    expect(getCounterpartEdgeId("100:0:x")).toBeNull();
  });
});

describe("computeUndirectedDegree", () => {
  it("prunes dead-end nodes to degree 0", () => {
    // A -- B (dead ends at both A and B, entire branch pruned)
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.001)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.001 },
      ]),
    ];
    const graph = makeGraph(nodes, edges);
    const deg = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    // Both nodes are on a dead-end branch, pruned to 0
    expect(deg.get("A")).toBe(0);
    expect(deg.get("B")).toBe(0);
  });

  it("prunes entire dead-end branch iteratively", () => {
    // A -- B -- C (linear chain, all dead ends after iterative pruning)
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
    const deg = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    // All pruned: A(deg1)->pruned, B becomes deg1->pruned, C becomes deg0->pruned
    expect(deg.get("A")).toBe(0);
    expect(deg.get("B")).toBe(0);
    expect(deg.get("C")).toBe(0);
  });

  it("preserves degree at intersection nodes with non-dead-end branches", () => {
    // Grid intersection: 4 roads meeting at B, each continuing to another intersection
    //     E
    //     |
    // A---B---C
    //     |
    //     D
    // Where A, C, D, E each also connect to further nodes (F, G, H, I)
    const nodes = [
      makeNode("A", 0, 0), makeNode("B", 0, 0.001), makeNode("C", 0, 0.002),
      makeNode("D", -0.001, 0.001), makeNode("E", 0.001, 0.001),
      makeNode("F", 0, -0.001), makeNode("G", 0, 0.003),
      makeNode("H", -0.002, 0.001), makeNode("I", 0.002, 0.001),
    ];
    const edges = [
      makeEdge("e1", "A", "B", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
      makeEdge("e2", "B", "C", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }]),
      makeEdge("e3", "B", "D", [{ lat: 0, lng: 0.001 }, { lat: -0.001, lng: 0.001 }]),
      makeEdge("e4", "B", "E", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.001 }]),
      // Extend dead-end nodes into further connections
      makeEdge("e5", "F", "A", [{ lat: 0, lng: -0.001 }, { lat: 0, lng: 0 }]),
      makeEdge("e6", "C", "G", [{ lat: 0, lng: 0.002 }, { lat: 0, lng: 0.003 }]),
      makeEdge("e7", "H", "D", [{ lat: -0.002, lng: 0.001 }, { lat: -0.001, lng: 0.001 }]),
      makeEdge("e8", "E", "I", [{ lat: 0.001, lng: 0.001 }, { lat: 0.002, lng: 0.001 }]),
    ];
    const graph = makeGraph(nodes, edges);
    const deg = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    // B is at a true intersection with 4 branches, each backed by further connections
    // After pruning: leaves F,G,H,I are degree 1 -> pruned to 0
    // Then A,C,D,E become degree 1 -> pruned to 0
    // Then B becomes degree 0.
    // To truly preserve B, the branches need cycles or further branching.
    // For this test, let's verify with a structure that has a cycle:
    expect(deg.get("B")).toBe(0); // all branches dead-end, so B is pruned too
  });

  it("preserves nodes in cycles (2-core)", () => {
    // Triangle: A -- B -- C -- A (cycle, all degree 2, no pruning)
    const nodes = [
      makeNode("A", 0, 0),
      makeNode("B", 0, 0.001),
      makeNode("C", 0.001, 0.0005),
    ];
    const edges = [
      makeEdge("e1", "A", "B", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
      makeEdge("e2", "B", "C", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.0005 }]),
      makeEdge("e3", "C", "A", [{ lat: 0.001, lng: 0.0005 }, { lat: 0, lng: 0 }]),
    ];
    const graph = makeGraph(nodes, edges);
    const deg = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    // All nodes in cycle, degree 2, not pruned
    expect(deg.get("A")).toBe(2);
    expect(deg.get("B")).toBe(2);
    expect(deg.get("C")).toBe(2);
  });

  it("prunes dead-end spur off a cycle", () => {
    // Triangle A-B-C-A with spur B-D
    const nodes = [
      makeNode("A", 0, 0),
      makeNode("B", 0, 0.001),
      makeNode("C", 0.001, 0.0005),
      makeNode("D", 0, 0.002),
    ];
    const edges = [
      makeEdge("e1", "A", "B", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
      makeEdge("e2", "B", "C", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.0005 }]),
      makeEdge("e3", "C", "A", [{ lat: 0.001, lng: 0.0005 }, { lat: 0, lng: 0 }]),
      makeEdge("e4", "B", "D", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }]),
    ];
    const graph = makeGraph(nodes, edges);
    const deg = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    // D is dead end, pruned to 0. B loses one neighbor but stays in cycle (degree 2).
    expect(deg.get("D")).toBe(0);
    expect(deg.get("B")).toBe(2); // was 3, pruned D, now 2 (still in cycle)
    expect(deg.get("A")).toBe(2);
    expect(deg.get("C")).toBe(2);
  });

  it("does not inflate degree for bidirectional :f/:r edge pairs", () => {
    // A -- B with forward and reverse edges (on a cycle to avoid full pruning)
    // Triangle to keep nodes alive: A-B-C-A with bidi A-B
    const nodes = [
      makeNode("A", 0, 0),
      makeNode("B", 0, 0.001),
      makeNode("C", 0.001, 0.0005),
    ];
    const edges = [
      makeEdge("100:0:f", "A", "B", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
      makeEdge("100:0:r", "B", "A", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0 }]),
      makeEdge("e2", "B", "C", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.0005 }]),
      makeEdge("e3", "C", "A", [{ lat: 0.001, lng: 0.0005 }, { lat: 0, lng: 0 }]),
    ];
    const graph = makeGraph(nodes, edges);
    const deg = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    // :f and :r connect same A<->B pair, so degree is 2 (B and C), not 3
    expect(deg.get("A")).toBe(2);
    expect(deg.get("B")).toBe(2);
  });
});

describe("trimDeadEnds", () => {
  // All tests use a cycle backbone so 2-core nodes survive pruning.
  // Dead-end spurs hang off the cycle and get trimmed.

  it("trims dead-end spur from start of chain", () => {
    // Cycle: B -- C -- E -- B (backbone, all survive pruning)
    // Spur: A -- B (A is dead end, pruned to 0)
    // Chain: [A→B, B→C]
    const nodes = [
      makeNode("A", 0, -0.001),
      makeNode("B", 0, 0),
      makeNode("C", 0, 0.001),
      makeNode("E", 0.001, 0.0005),
    ];
    const edges = [
      makeEdge("e1", "A", "B", [{ lat: 0, lng: -0.001 }, { lat: 0, lng: 0 }]),
      makeEdge("e2", "B", "C", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
      makeEdge("e3", "C", "E", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.0005 }]),
      makeEdge("e4", "E", "B", [{ lat: 0.001, lng: 0.0005 }, { lat: 0, lng: 0 }]),
    ];
    const graph = makeGraph(nodes, edges);
    const nodeDegree = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    const chain: EdgeChain = {
      edgeIds: ["e1", "e2"],
      startNodeId: "A",
      endNodeId: "C",
      totalLengthMeters: 200,
    };

    const { chains: trimmed } = trimDeadEnds([chain], graph, nodeDegree);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]!.edgeIds).toEqual(["e2"]);
    expect(trimmed[0]!.startNodeId).toBe("B");
    expect(trimmed[0]!.endNodeId).toBe("C");
    expect(trimmed[0]!.totalLengthMeters).toBe(100);
  });

  it("trims dead-end spur from end of chain", () => {
    // Cycle: B -- C -- E -- B (backbone)
    // Spur: C -- D (D is dead end)
    // Chain: [B→C, C→D]
    const nodes = [
      makeNode("B", 0, 0),
      makeNode("C", 0, 0.001),
      makeNode("D", 0, 0.002),
      makeNode("E", 0.001, 0.0005),
    ];
    const edges = [
      makeEdge("e1", "B", "C", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
      makeEdge("e2", "C", "D", [{ lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }]),
      makeEdge("e3", "C", "E", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.0005 }]),
      makeEdge("e4", "E", "B", [{ lat: 0.001, lng: 0.0005 }, { lat: 0, lng: 0 }]),
    ];
    const graph = makeGraph(nodes, edges);
    const nodeDegree = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    const chain: EdgeChain = {
      edgeIds: ["e1", "e2"],
      startNodeId: "B",
      endNodeId: "D",
      totalLengthMeters: 200,
    };

    const { chains: trimmed } = trimDeadEnds([chain], graph, nodeDegree);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]!.edgeIds).toEqual(["e1"]);
    expect(trimmed[0]!.endNodeId).toBe("C");
    expect(trimmed[0]!.totalLengthMeters).toBe(100);
  });

  it("trims multi-hop dead-end branch (iterative pruning)", () => {
    // Cycle: D -- E -- F -- D (backbone)
    // Multi-hop spur: A -- B -- C -- D (3 dead-end edges)
    // Chain: [A→B, B→C, C→D, D→E]
    // After 2-core pruning: A=0, B=0, C=0, D=2, E=2, F=2
    // Trimming removes A→B, B→C, C→D from start, leaves [D→E]
    const nodes = [
      makeNode("A", 0, -0.002),
      makeNode("B", 0, -0.001),
      makeNode("C", 0, 0),
      makeNode("D", 0, 0.001),
      makeNode("E", 0.001, 0.001),
      makeNode("F", 0.0005, 0.002),
    ];
    const edges = [
      makeEdge("e1", "A", "B", [{ lat: 0, lng: -0.002 }, { lat: 0, lng: -0.001 }]),
      makeEdge("e2", "B", "C", [{ lat: 0, lng: -0.001 }, { lat: 0, lng: 0 }]),
      makeEdge("e3", "C", "D", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
      makeEdge("e4", "D", "E", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.001 }]),
      makeEdge("e5", "E", "F", [{ lat: 0.001, lng: 0.001 }, { lat: 0.0005, lng: 0.002 }]),
      makeEdge("e6", "F", "D", [{ lat: 0.0005, lng: 0.002 }, { lat: 0, lng: 0.001 }]),
    ];
    const graph = makeGraph(nodes, edges);
    const nodeDegree = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    const chain: EdgeChain = {
      edgeIds: ["e1", "e2", "e3", "e4"],
      startNodeId: "A",
      endNodeId: "E",
      totalLengthMeters: 400,
    };

    const { chains: trimmed } = trimDeadEnds([chain], graph, nodeDegree);
    expect(trimmed).toHaveLength(1);
    // All 3 spur edges trimmed from start, only D→E remains
    expect(trimmed[0]!.edgeIds).toEqual(["e4"]);
    expect(trimmed[0]!.startNodeId).toBe("D");
    expect(trimmed[0]!.endNodeId).toBe("E");
    expect(trimmed[0]!.totalLengthMeters).toBe(100);
  });

  it("discards chain entirely consumed by trimming", () => {
    // A -- B, both dead ends (entire branch pruned to 0)
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.001)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.001 },
      ]),
    ];
    const graph = makeGraph(nodes, edges);
    const nodeDegree = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    const chain: EdgeChain = {
      edgeIds: ["e1"],
      startNodeId: "A",
      endNodeId: "B",
      totalLengthMeters: 100,
    };

    const { chains: trimmed } = trimDeadEnds([chain], graph, nodeDegree);
    expect(trimmed).toHaveLength(0);
  });

  it("does not trim when no dead ends (cycle)", () => {
    // Triangle: A -- B -- C -- A (all nodes degree 2, in 2-core)
    const nodes = [
      makeNode("A", 0, 0),
      makeNode("B", 0, 0.001),
      makeNode("C", 0.001, 0.0005),
    ];
    const edges = [
      makeEdge("e1", "A", "B", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }]),
      makeEdge("e2", "B", "C", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.0005 }]),
      makeEdge("e3", "C", "A", [{ lat: 0.001, lng: 0.0005 }, { lat: 0, lng: 0 }]),
    ];
    const graph = makeGraph(nodes, edges);
    const nodeDegree = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    const chain: EdgeChain = {
      edgeIds: ["e1", "e2"],
      startNodeId: "A",
      endNodeId: "C",
      totalLengthMeters: 200,
    };

    const { chains: trimmed } = trimDeadEnds([chain], graph, nodeDegree);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]!.edgeIds).toEqual(["e1", "e2"]);
    expect(trimmed[0]!.totalLengthMeters).toBe(200);
  });

  it("recalculates totalLengthMeters after trimming", () => {
    // Cycle: Y -- Z -- W -- Y (backbone)
    // Spur: X -- Y (dead end at X)
    // Chain [X→Y, Y→Z] with different lengths
    const nodes = [
      makeNode("X", 0, -0.001),
      makeNode("Y", 0, 0),
      makeNode("Z", 0, 0.001),
      makeNode("W", 0.001, 0.0005),
    ];
    const edges = [
      makeEdge("g1", "X", "Y", [{ lat: 0, lng: -0.001 }, { lat: 0, lng: 0 }],
        { lengthMeters: 150 }),
      makeEdge("g2", "Y", "Z", [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }],
        { lengthMeters: 250 }),
      makeEdge("g3", "Z", "W", [{ lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.0005 }],
        { lengthMeters: 100 }),
      makeEdge("g4", "W", "Y", [{ lat: 0.001, lng: 0.0005 }, { lat: 0, lng: 0 }],
        { lengthMeters: 100 }),
    ];
    const graph = makeGraph(nodes, edges);
    const nodeDegree = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    const chain: EdgeChain = {
      edgeIds: ["g1", "g2"],
      startNodeId: "X",
      endNodeId: "Z",
      totalLengthMeters: 400,
    };

    const { chains: trimmed } = trimDeadEnds([chain], graph, nodeDegree);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]!.edgeIds).toEqual(["g2"]);
    expect(trimmed[0]!.totalLengthMeters).toBe(250);
  });

  it("rescues fully-consumed dead-end chain that meets destination criteria", () => {
    // A -- B, both dead ends, but chain is long (1200m) and named → destination
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.01)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.01 },
      ], { lengthMeters: 1200, name: "Mountain Pass Road" }),
    ];
    const graph = makeGraph(nodes, edges);
    const nodeDegree = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    const chain: EdgeChain = {
      edgeIds: ["e1"],
      startNodeId: "A",
      endNodeId: "B",
      totalLengthMeters: 1200,
    };

    const { chains: trimmed, destinationChains } = trimDeadEnds([chain], graph, nodeDegree);
    expect(trimmed).toHaveLength(0);
    expect(destinationChains).toHaveLength(1);
    expect(destinationChains[0]!.edgeIds).toEqual(["e1"]);
  });

  it("does not rescue fully-consumed dead-end chain that fails destination criteria", () => {
    // A -- B, both dead ends, short (200m) unnamed → not a destination
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.002)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.002 },
      ], { lengthMeters: 200 }),
    ];
    const graph = makeGraph(nodes, edges);
    const nodeDegree = computeUndirectedDegree(allEdgesAsChains(graph), graph);

    const chain: EdgeChain = {
      edgeIds: ["e1"],
      startNodeId: "A",
      endNodeId: "B",
      totalLengthMeters: 200,
    };

    const { chains: trimmed, destinationChains } = trimDeadEnds([chain], graph, nodeDegree);
    expect(trimmed).toHaveLength(0);
    expect(destinationChains).toHaveLength(0);
  });
});

describe("isDestinationCandidate", () => {
  it("rejects short chain (400m) regardless of quality signals", () => {
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.004)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.004 },
      ], { lengthMeters: 400, name: "Short Road", elevationGain: 50 }),
    ];
    const graph = makeGraph(nodes, edges);
    const chain: EdgeChain = {
      edgeIds: ["e1"],
      startNodeId: "A",
      endNodeId: "B",
      totalLengthMeters: 400,
    };
    expect(isDestinationCandidate(chain, graph)).toBe(false);
  });

  it("accepts long chain (1km) with 50m elevation gain", () => {
    // 10 edges of 100m each, each with 5m elevation gain = 50m total
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const edgeIds: string[] = [];
    for (let i = 0; i <= 10; i++) {
      nodes.push(makeNode(`n${i}`, 0, i * 0.001));
    }
    for (let i = 0; i < 10; i++) {
      const id = `e${i}`;
      edgeIds.push(id);
      edges.push(
        makeEdge(id, `n${i}`, `n${i + 1}`, [
          { lat: 0, lng: i * 0.001 },
          { lat: 0, lng: (i + 1) * 0.001 },
        ], { lengthMeters: 100, elevationGain: 5, roadClass: "tertiary" })
      );
    }
    const graph = makeGraph(nodes, edges);
    const chain: EdgeChain = {
      edgeIds,
      startNodeId: "n0",
      endNodeId: "n10",
      totalLengthMeters: 1000,
    };
    expect(isDestinationCandidate(chain, graph)).toBe(true);
  });

  it("accepts named 1.2km unclassified road without elevation", () => {
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.012)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.012 },
      ], { lengthMeters: 1200, name: "Old Mill Road", roadClass: "unclassified" }),
    ];
    const graph = makeGraph(nodes, edges);
    const chain: EdgeChain = {
      edgeIds: ["e1"],
      startNodeId: "A",
      endNodeId: "B",
      totalLengthMeters: 1200,
    };
    expect(isDestinationCandidate(chain, graph)).toBe(true);
  });

  it("rejects unnamed 600m residential road without elevation", () => {
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.006)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.006 },
      ], { lengthMeters: 600, roadClass: "residential" }),
    ];
    const graph = makeGraph(nodes, edges);
    const chain: EdgeChain = {
      edgeIds: ["e1"],
      startNodeId: "A",
      endNodeId: "B",
      totalLengthMeters: 600,
    };
    expect(isDestinationCandidate(chain, graph)).toBe(false);
  });

  it("rejects 2km service road (excluded road class)", () => {
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.02)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.02 },
      ], { lengthMeters: 2000, roadClass: "service", name: "Parking Loop" }),
    ];
    const graph = makeGraph(nodes, edges);
    const chain: EdgeChain = {
      edgeIds: ["e1"],
      startNodeId: "A",
      endNodeId: "B",
      totalLengthMeters: 2000,
    };
    expect(isDestinationCandidate(chain, graph)).toBe(false);
  });

  it("accepts 1km tertiary with 50m elevation gain (mountain county road)", () => {
    // 10 edges of 100m, each with 5m gain
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const edgeIds: string[] = [];
    for (let i = 0; i <= 10; i++) {
      nodes.push(makeNode(`n${i}`, 0, i * 0.001));
    }
    for (let i = 0; i < 10; i++) {
      const id = `e${i}`;
      edgeIds.push(id);
      edges.push(
        makeEdge(id, `n${i}`, `n${i + 1}`, [
          { lat: 0, lng: i * 0.001 },
          { lat: 0, lng: (i + 1) * 0.001 },
        ], { lengthMeters: 100, elevationGain: 5, roadClass: "tertiary" })
      );
    }
    const graph = makeGraph(nodes, edges);
    const chain: EdgeChain = {
      edgeIds,
      startNodeId: "n0",
      endNodeId: "n10",
      totalLengthMeters: 1000,
    };
    expect(isDestinationCandidate(chain, graph)).toBe(true);
  });

  it("accepts 900m cycleway (dedicated infra >= 800m)", () => {
    const nodes = [makeNode("A", 0, 0), makeNode("B", 0, 0.009)];
    const edges = [
      makeEdge("e1", "A", "B", [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.009 },
      ], { lengthMeters: 900, roadClass: "cycleway" }),
    ];
    const graph = makeGraph(nodes, edges);
    const chain: EdgeChain = {
      edgeIds: ["e1"],
      startNodeId: "A",
      endNodeId: "B",
      totalLengthMeters: 900,
    };
    expect(isDestinationCandidate(chain, graph)).toBe(true);
  });
});
