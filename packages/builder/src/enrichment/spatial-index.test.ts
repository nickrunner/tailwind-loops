import { describe, it, expect } from "vitest";
import type { Graph, GraphEdge, GraphNode, Observation } from "@tailwind-loops/types";
import { EdgeSpatialIndex } from "./spatial-index.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(id: string, lat: number, lng: number): GraphNode {
  return { id, coordinate: { lat, lng } };
}

function makeEdge(
  id: string,
  from: string,
  to: string,
  geometry: { lat: number; lng: number }[]
): GraphEdge {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    geometry,
    attributes: {
      roadClass: "residential",
      surfaceClassification: {
        surface: "paved",
        confidence: 0.7,
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
    },
  };
}

function makeGraph(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Graph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(edges.map((e) => [e.id, e]));
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromNodeId) ?? [];
    list.push(edge.id);
    adjacency.set(edge.fromNodeId, list);
  }
  return { nodes: nodeMap, edges: edgeMap, adjacency };
}

// Grand Rapids area coordinates (~42.96, -85.67)
const BASE_LAT = 42.96;
const BASE_LNG = -85.67;

// ─── EdgeSpatialIndex ───────────────────────────────────────────────────────

describe("EdgeSpatialIndex", () => {
  const nodes = [
    makeNode("n1", BASE_LAT, BASE_LNG),
    makeNode("n2", BASE_LAT + 0.001, BASE_LNG), // ~111m north
    makeNode("n3", BASE_LAT, BASE_LNG + 0.001), // ~82m east
  ];

  const edges = [
    makeEdge("e1", "n1", "n2", [
      { lat: BASE_LAT, lng: BASE_LNG },
      { lat: BASE_LAT + 0.001, lng: BASE_LNG },
    ]),
    makeEdge("e2", "n1", "n3", [
      { lat: BASE_LAT, lng: BASE_LNG },
      { lat: BASE_LAT, lng: BASE_LNG + 0.001 },
    ]),
  ];

  const graph = makeGraph(nodes, edges);

  it("constructs without error", () => {
    expect(() => new EdgeSpatialIndex(graph)).not.toThrow();
  });

  describe("snapToEdge", () => {
    it("snaps a nearby point to the correct edge", () => {
      const index = new EdgeSpatialIndex(graph);
      // Point close to e1 (slightly east of the N-S line)
      const result = index.snapToEdge(
        { lat: BASE_LAT + 0.0005, lng: BASE_LNG + 0.0001 },
        50
      );
      expect(result).toBe("e1");
    });

    it("snaps a nearby point to east edge", () => {
      const index = new EdgeSpatialIndex(graph);
      // Point close to e2 (slightly north of the E-W line)
      const result = index.snapToEdge(
        { lat: BASE_LAT + 0.0001, lng: BASE_LNG + 0.0005 },
        50
      );
      expect(result).toBe("e2");
    });

    it("returns null when no edge is within range", () => {
      const index = new EdgeSpatialIndex(graph);
      // Point far from any edge
      const result = index.snapToEdge(
        { lat: BASE_LAT + 0.01, lng: BASE_LNG + 0.01 },
        50
      );
      expect(result).toBeNull();
    });
  });

  describe("matchLinestring", () => {
    it("matches a linestring near an edge", () => {
      const index = new EdgeSpatialIndex(graph);
      const coords = [
        { lat: BASE_LAT + 0.0001, lng: BASE_LNG + 0.0001 },
        { lat: BASE_LAT + 0.0005, lng: BASE_LNG + 0.0001 },
      ];
      const result = index.matchLinestring(coords, 50);
      expect(result).toContain("e1");
    });

    it("returns empty for linestring far from edges", () => {
      const index = new EdgeSpatialIndex(graph);
      const coords = [
        { lat: BASE_LAT + 0.01, lng: BASE_LNG + 0.01 },
        { lat: BASE_LAT + 0.011, lng: BASE_LNG + 0.01 },
      ];
      const result = index.matchLinestring(coords, 50);
      expect(result).toHaveLength(0);
    });
  });

  describe("matchToEdges", () => {
    it("matches point observations to edges", () => {
      const index = new EdgeSpatialIndex(graph);
      const observations: Observation[] = [
        {
          attribute: "stop-sign",
          source: "osm-tag",
          value: {
            coordinate: { lat: BASE_LAT + 0.0005, lng: BASE_LNG + 0.0001 },
            detectionConfidence: 0.9,
          },
          sourceConfidence: 0.8,
        },
      ];
      const result = index.matchToEdges(observations, 50);
      expect(result.has("e1")).toBe(true);
    });

    it("matches observations with osmWayId directly without spatial proximity", () => {
      // Add osmWayId to edge e1
      const edgeWithWayId = {
        ...edges[0]!,
        osmWayId: "way-12345",
      };
      const graphWithWayId = makeGraph(nodes, [edgeWithWayId, edges[1]!]);
      const index = new EdgeSpatialIndex(graphWithWayId);

      // Observation far from any edge but with matching osmWayId
      const observations: Observation[] = [
        {
          attribute: "surface",
          source: "mapillary",
          value: "paved",
          sourceConfidence: 0.9,
          osmWayId: "way-12345",
        },
      ];
      const result = index.matchToEdges(observations, 50);
      expect(result.has(edgeWithWayId.id)).toBe(true);
      expect(result.get(edgeWithWayId.id)).toHaveLength(1);
    });

    it("returns empty for osmWayId that doesn't match any edge", () => {
      const index = new EdgeSpatialIndex(graph);
      const observations: Observation[] = [
        {
          attribute: "surface",
          source: "mapillary",
          value: "paved",
          sourceConfidence: 0.9,
          osmWayId: "nonexistent-way",
        },
      ];
      const result = index.matchToEdges(observations, 50);
      expect(result.size).toBe(0);
    });

    it("matches linestring observations via geometry", () => {
      const index = new EdgeSpatialIndex(graph);
      const observations: Observation[] = [
        {
          attribute: "surface",
          source: "gravelmap",
          value: "paved",
          sourceConfidence: 0.9,
          geometry: [
            { lat: BASE_LAT, lng: BASE_LNG + 0.0001 },
            { lat: BASE_LAT, lng: BASE_LNG + 0.0005 },
          ],
        },
      ];
      const result = index.matchToEdges(observations, 50);
      expect(result.has("e2")).toBe(true);
    });
  });
});
