import { describe, it, expect } from "vitest";
import { parseOverpassResponse } from "./parser.js";
import type { OverpassJson } from "overpass-ts";

/** Collect all elements from an async generator */
async function collectAll<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

function makeOverpassResponse(
  elements: OverpassJson["elements"]
): OverpassJson {
  return {
    version: 0.6,
    generator: "test",
    osm3s: {
      timestamp_osm_base: "2024-01-01T00:00:00Z",
      copyright: "test",
    },
    elements,
  };
}

describe("parseOverpassResponse", () => {
  it("converts Overpass nodes to OsmNode", async () => {
    const response = makeOverpassResponse([
      {
        type: "node",
        id: 123,
        lat: 42.96,
        lon: -85.66,
        tags: { highway: "traffic_signals" },
      },
    ]);

    const elements = await collectAll(parseOverpassResponse(response));

    expect(elements).toHaveLength(1);
    expect(elements[0]).toEqual({
      type: "node",
      id: 123,
      lat: 42.96,
      lon: -85.66,
      tags: { highway: "traffic_signals" },
    });
  });

  it("converts Overpass ways to OsmWay with refs from nodes[]", async () => {
    const response = makeOverpassResponse([
      {
        type: "way",
        id: 100,
        nodes: [1, 2, 3],
        tags: { highway: "residential", name: "Main St" },
        geometry: [
          { lat: 42.96, lon: -85.66 },
          { lat: 42.961, lon: -85.661 },
          { lat: 42.962, lon: -85.662 },
        ],
      },
    ]);

    const elements = await collectAll(parseOverpassResponse(response));

    // Should have 3 synthesized nodes + 1 way = 4 elements
    expect(elements).toHaveLength(4);

    // First 3 should be nodes
    const nodes = elements.filter((e) => e.type === "node");
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({
      type: "node",
      id: 1,
      lat: 42.96,
      lon: -85.66,
    });
    expect(nodes[1]).toEqual({
      type: "node",
      id: 2,
      lat: 42.961,
      lon: -85.661,
    });

    // Last should be the way
    const ways = elements.filter((e) => e.type === "way");
    expect(ways).toHaveLength(1);
    expect(ways[0]).toEqual({
      type: "way",
      id: 100,
      refs: [1, 2, 3],
      tags: { highway: "residential", name: "Main St" },
    });
  });

  it("deduplicates nodes across explicit and way-geometry sources", async () => {
    const response = makeOverpassResponse([
      // Explicit node (e.g., traffic signal)
      {
        type: "node",
        id: 2,
        lat: 42.961,
        lon: -85.661,
        tags: { highway: "traffic_signals" },
      },
      // Way that references the same node
      {
        type: "way",
        id: 100,
        nodes: [1, 2, 3],
        tags: { highway: "residential" },
        geometry: [
          { lat: 42.96, lon: -85.66 },
          { lat: 42.961, lon: -85.661 },
          { lat: 42.962, lon: -85.662 },
        ],
      },
    ]);

    const elements = await collectAll(parseOverpassResponse(response));

    // Node 2 should appear only once (the explicit version with tags)
    const nodes = elements.filter((e) => e.type === "node");
    expect(nodes).toHaveLength(3); // node 2 (explicit) + node 1, 3 (from geometry)

    const node2 = nodes.find(
      (e) => e.type === "node" && e.id === 2
    );
    expect(node2).toBeDefined();
    expect(node2!.tags).toEqual({ highway: "traffic_signals" });
  });

  it("skips ways without relevant highway tags", async () => {
    const response = makeOverpassResponse([
      {
        type: "way",
        id: 100,
        nodes: [1, 2],
        tags: { highway: "motorway" },
        geometry: [
          { lat: 42.96, lon: -85.66 },
          { lat: 42.961, lon: -85.661 },
        ],
      },
    ]);

    const elements = await collectAll(parseOverpassResponse(response));

    // Motorway is not a relevant highway, so the way and its geometry nodes should be skipped
    const ways = elements.filter((e) => e.type === "way");
    expect(ways).toHaveLength(0);
  });

  it("handles ways without geometry gracefully", async () => {
    const response = makeOverpassResponse([
      {
        type: "way",
        id: 100,
        nodes: [1, 2],
        tags: { highway: "residential" },
        // No geometry field
      },
    ]);

    const elements = await collectAll(parseOverpassResponse(response));

    // Way should still be yielded (graph builder will skip it if nodes are missing)
    const ways = elements.filter((e) => e.type === "way");
    expect(ways).toHaveLength(1);
    expect(ways[0]).toEqual({
      type: "way",
      id: 100,
      refs: [1, 2],
      tags: { highway: "residential" },
    });
  });

  it("produces elements compatible with buildGraphFromOsm", async () => {
    // Simulate a small Overpass response with intersecting ways
    const response = makeOverpassResponse([
      {
        type: "node",
        id: 2,
        lat: 42.961,
        lon: -85.661,
        tags: { highway: "stop" },
      },
      {
        type: "way",
        id: 100,
        nodes: [1, 2, 3],
        tags: { highway: "residential", name: "Main St" },
        geometry: [
          { lat: 42.96, lon: -85.66 },
          { lat: 42.961, lon: -85.661 },
          { lat: 42.962, lon: -85.662 },
        ],
      },
      {
        type: "way",
        id: 200,
        nodes: [4, 2, 5],
        tags: { highway: "residential", name: "Oak Ave" },
        geometry: [
          { lat: 42.96, lon: -85.662 },
          { lat: 42.961, lon: -85.661 },
          { lat: 42.962, lon: -85.66 },
        ],
      },
    ]);

    const elements = await collectAll(parseOverpassResponse(response));

    // Verify we get both ways
    const ways = elements.filter((e) => e.type === "way");
    expect(ways).toHaveLength(2);

    // Verify all referenced node IDs have corresponding OsmNode entries
    const nodeIds = new Set(
      elements.filter((e) => e.type === "node").map((e) => e.id)
    );
    for (const way of ways) {
      if (way.type === "way") {
        for (const ref of way.refs) {
          expect(nodeIds.has(ref)).toBe(true);
        }
      }
    }
  });

  it("handles empty response", async () => {
    const response = makeOverpassResponse([]);
    const elements = await collectAll(parseOverpassResponse(response));
    expect(elements).toHaveLength(0);
  });
});
