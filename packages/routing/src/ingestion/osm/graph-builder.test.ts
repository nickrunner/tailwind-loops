import { describe, it, expect } from "vitest";
import {
  buildGraphFromOsm,
  haversineDistance,
  calculatePathLength,
} from "./graph-builder.js";
import type { OsmNode, OsmWay } from "./types.js";

/**
 * Create a mock async iterable from an array of elements.
 */
async function* mockOsmElements(
  elements: (OsmNode | OsmWay)[]
): AsyncGenerator<OsmNode | OsmWay> {
  for (const element of elements) {
    yield element;
  }
}

describe("haversineDistance", () => {
  it("calculates distance between two points", () => {
    // Grand Rapids, MI to Lansing, MI - approximately 100km
    const grandRapids = { lat: 42.9634, lng: -85.6681 };
    const lansing = { lat: 42.7325, lng: -84.5555 };

    const distance = haversineDistance(grandRapids, lansing);

    // Should be approximately 100km (100,000m)
    expect(distance).toBeGreaterThan(90000);
    expect(distance).toBeLessThan(110000);
  });

  it("returns 0 for same point", () => {
    const point = { lat: 42.9634, lng: -85.6681 };
    expect(haversineDistance(point, point)).toBe(0);
  });

  it("calculates short distances accurately", () => {
    // Two points roughly 1km apart
    const a = { lat: 42.9634, lng: -85.6681 };
    const b = { lat: 42.9724, lng: -85.6681 }; // ~1km north

    const distance = haversineDistance(a, b);
    expect(distance).toBeGreaterThan(900);
    expect(distance).toBeLessThan(1100);
  });
});

describe("calculatePathLength", () => {
  it("calculates total length of a path", () => {
    const coords = [
      { lat: 42.9634, lng: -85.6681 },
      { lat: 42.9724, lng: -85.6681 }, // ~1km north
      { lat: 42.9724, lng: -85.6551 }, // ~1km east
    ];

    const length = calculatePathLength(coords);
    expect(length).toBeGreaterThan(1800);
    expect(length).toBeLessThan(2200);
  });

  it("returns 0 for single point", () => {
    expect(calculatePathLength([{ lat: 42.9634, lng: -85.6681 }])).toBe(0);
  });

  it("returns 0 for empty path", () => {
    expect(calculatePathLength([])).toBe(0);
  });
});

describe("buildGraphFromOsm", () => {
  it("creates nodes at way endpoints", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "residential" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    expect(graph.nodes.size).toBe(2);
    expect(graph.nodes.has("1")).toBe(true);
    expect(graph.nodes.has("2")).toBe(true);
  });

  it("creates bidirectional edges for normal roads", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "residential" } },
    ]);

    const { graph, stats } = await buildGraphFromOsm(elements);

    // Two edges: forward and reverse
    expect(graph.edges.size).toBe(2);
    expect(stats.bidirectionalEdgePairs).toBe(1);
    expect(stats.oneWayEdges).toBe(0);
  });

  it("creates single edge for one-way streets", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      {
        type: "way",
        id: 100,
        refs: [1, 2],
        tags: { highway: "primary", oneway: "yes" },
      },
    ]);

    const { graph, stats } = await buildGraphFromOsm(elements);

    expect(graph.edges.size).toBe(1);
    expect(stats.oneWayEdges).toBe(1);
    expect(stats.bidirectionalEdgePairs).toBe(0);

    // Edge should go from node 1 to node 2
    const edge = [...graph.edges.values()][0]!;
    expect(edge.fromNodeId).toBe("1");
    expect(edge.toNodeId).toBe("2");
  });

  it("reverses edge direction for oneway=-1", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      {
        type: "way",
        id: 100,
        refs: [1, 2],
        tags: { highway: "primary", oneway: "-1" },
      },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    const edge = [...graph.edges.values()][0]!;
    // Edge should go from node 2 to node 1 (reversed)
    expect(edge.fromNodeId).toBe("2");
    expect(edge.toNodeId).toBe("1");
  });

  it("calculates edge length correctly", async () => {
    // Two nodes roughly 1km apart
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9634, lon: -85.6681 },
      { type: "node", id: 2, lat: 42.9724, lon: -85.6681 },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "residential" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    const edge = [...graph.edges.values()][0]!;
    expect(edge.attributes.lengthMeters).toBeGreaterThan(900);
    expect(edge.attributes.lengthMeters).toBeLessThan(1100);
  });

  it("splits ways at intersections", async () => {
    // Two ways sharing a common node (intersection)
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.6 }, // intersection
      { type: "node", id: 3, lat: 42.92, lon: -85.6 },
      { type: "node", id: 4, lat: 42.91, lon: -85.61 },
      // Way 1: nodes 1-2-3 (north-south)
      { type: "way", id: 100, refs: [1, 2, 3], tags: { highway: "residential" } },
      // Way 2: nodes 2-4 (east-west from intersection)
      { type: "way", id: 101, refs: [2, 4], tags: { highway: "residential" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    // Node 2 is an intersection, so way 100 should be split into two edges
    // Way 100: edges 1->2 and 2->3 (plus reverse)
    // Way 101: edge 2->4 (plus reverse)
    // Total: 6 edges (3 pairs)
    expect(graph.edges.size).toBe(6);

    // Check that node 2 has edges to all neighbors
    const node2Edges = graph.adjacency.get("2") ?? [];
    expect(node2Edges.length).toBe(3); // to 1, 3, and 4
  });

  it("stores edge geometry", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      { type: "node", id: 3, lat: 42.92, lon: -85.62 },
      { type: "way", id: 100, refs: [1, 2, 3], tags: { highway: "path" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    // Since nodes 2 is not an intersection, the whole way is one edge
    const forwardEdge = graph.edges.get("100:0:f")!;
    expect(forwardEdge.geometry.length).toBe(3);
    expect(forwardEdge.geometry[0]).toEqual({ lat: 42.9, lng: -85.6 });
    expect(forwardEdge.geometry[2]).toEqual({ lat: 42.92, lng: -85.62 });
  });

  it("extracts road class from tags", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "cycleway" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    const edge = [...graph.edges.values()][0]!;
    expect(edge.attributes.roadClass).toBe("cycleway");
  });

  it("extracts surface classification from tags", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      {
        type: "way",
        id: 100,
        refs: [1, 2],
        tags: { highway: "path", surface: "gravel" },
      },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    const edge = [...graph.edges.values()][0]!;
    expect(edge.attributes.surfaceClassification.surface).toBe("gravel");
    expect(edge.attributes.surfaceClassification.confidence).toBeGreaterThan(0);
  });

  it("extracts infrastructure from tags", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "cycleway" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    const edge = [...graph.edges.values()][0]!;
    expect(edge.attributes.infrastructure.hasDedicatedPath).toBe(true);
    expect(edge.attributes.infrastructure.isSeparated).toBe(true);
  });

  it("extracts speed limit and lanes", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      {
        type: "way",
        id: 100,
        refs: [1, 2],
        tags: { highway: "primary", maxspeed: "45 mph", lanes: "4" },
      },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    const edge = [...graph.edges.values()][0]!;
    expect(edge.attributes.speedLimit).toBe(72); // 45 mph ≈ 72 km/h
    expect(edge.attributes.lanes).toBe(4);
  });

  it("builds adjacency list correctly", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "residential" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    // Node 1 should have one outgoing edge (to node 2)
    const node1Edges = graph.adjacency.get("1") ?? [];
    expect(node1Edges.length).toBe(1);

    // Node 2 should have one outgoing edge (to node 1, reverse direction)
    const node2Edges = graph.adjacency.get("2") ?? [];
    expect(node2Edges.length).toBe(1);
  });

  it("handles ways with missing nodes gracefully", async () => {
    // Way references a node that doesn't exist
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      // Node 2 is missing!
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "residential" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    // Way should be skipped (not enough valid nodes)
    expect(graph.edges.size).toBe(0);
  });

  it("stores OSM way ID on edges", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      { type: "way", id: 12345, refs: [1, 2], tags: { highway: "path" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);

    const edge = [...graph.edges.values()][0]!;
    expect(edge.osmWayId).toBe("12345");
  });

  it("reports statistics correctly", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.6 },
      { type: "node", id: 3, lat: 42.92, lon: -85.6 },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "residential" } },
      {
        type: "way",
        id: 101,
        refs: [2, 3],
        tags: { highway: "primary", oneway: "yes" },
      },
    ]);

    const { stats } = await buildGraphFromOsm(elements);

    expect(stats.nodesCount).toBe(3);
    expect(stats.waysProcessed).toBe(2);
    expect(stats.edgesCount).toBe(3); // 2 bidirectional + 1 one-way
    expect(stats.bidirectionalEdgePairs).toBe(1);
    expect(stats.oneWayEdges).toBe(1);
    expect(stats.totalLengthMeters).toBeGreaterThan(0);
    expect(stats.buildTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("detects stop signs from OSM node tags", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6, tags: { highway: "stop" } },
      { type: "node", id: 2, lat: 42.91, lon: -85.61 },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "residential" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);
    expect(graph.nodes.get("1")!.hasStop).toBe(true);
    expect(graph.nodes.get("2")!.hasStop).toBeUndefined();
  });

  it("detects traffic signals from OSM node tags", async () => {
    const elements = mockOsmElements([
      { type: "node", id: 1, lat: 42.9, lon: -85.6 },
      { type: "node", id: 2, lat: 42.91, lon: -85.61, tags: { highway: "traffic_signals" } },
      { type: "way", id: 100, refs: [1, 2], tags: { highway: "residential" } },
    ]);

    const { graph } = await buildGraphFromOsm(elements);
    expect(graph.nodes.get("1")!.hasSignal).toBeUndefined();
    expect(graph.nodes.get("2")!.hasSignal).toBe(true);
  });
});
