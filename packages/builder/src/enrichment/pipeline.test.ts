import { describe, it, expect } from "vitest";
import type {
  Graph,
  GraphEdge,
  GraphNode,
  BoundingBox,
  Observation,
} from "@tailwind-loops/types";
import type { EnrichmentProvider } from "./provider.js";
import { enrichGraph } from "./pipeline.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const BASE_LAT = 42.96;
const BASE_LNG = -85.67;

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
        surface: "unknown",
        confidence: 0.2,
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
    },
  };
}

function makeGraph(): Graph {
  const nodes = [
    makeNode("n1", BASE_LAT, BASE_LNG),
    makeNode("n2", BASE_LAT + 0.001, BASE_LNG),
  ];
  const edges = [
    makeEdge("e1", "n1", "n2", [
      { lat: BASE_LAT, lng: BASE_LNG },
      { lat: BASE_LAT + 0.001, lng: BASE_LNG },
    ]),
  ];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(edges.map((e) => [e.id, e]));
  const adjacency = new Map<string, string[]>();
  adjacency.set("n1", ["e1"]);
  return { nodes: nodeMap, edges: edgeMap, adjacency };
}

function makeMockProvider(observations: Observation[]): EnrichmentProvider {
  return {
    source: "osm-tag",
    name: "Mock Provider",
    provides: ["surface", "speed-limit"],
    fetchObservations: async (_bounds: BoundingBox) => observations,
  };
}

// ─── enrichGraph ────────────────────────────────────────────────────────────

describe("enrichGraph", () => {
  const bounds: BoundingBox = {
    minLat: BASE_LAT - 0.01,
    maxLat: BASE_LAT + 0.01,
    minLng: BASE_LNG - 0.01,
    maxLng: BASE_LNG + 0.01,
  };

  it("enriches edges with surface data from a provider", async () => {
    const graph = makeGraph();
    const provider = makeMockProvider([
      {
        attribute: "surface",
        source: "gravelmap",
        value: "paved",
        sourceConfidence: 0.9,
        geometry: [
          { lat: BASE_LAT, lng: BASE_LNG },
          { lat: BASE_LAT + 0.0005, lng: BASE_LNG },
        ],
      },
    ]);

    const stats = await enrichGraph(graph, { bounds, providers: [provider] });

    expect(stats.providers).toHaveLength(1);
    expect(stats.providers[0]!.observationCount).toBe(1);

    const edge = graph.edges.get("e1")!;
    expect(edge.attributes.enrichment).toBeDefined();
    expect(edge.attributes.enrichment!.surface).toBeDefined();
    expect(edge.attributes.enrichment!.surface!.confidence).toBeGreaterThan(0);
  });

  it("enriches edges with speed limit data", async () => {
    const graph = makeGraph();
    const provider = makeMockProvider([
      {
        attribute: "speed-limit",
        source: "osm-tag",
        value: 40,
        sourceConfidence: 0.8,
        geometry: [
          { lat: BASE_LAT, lng: BASE_LNG },
          { lat: BASE_LAT + 0.0005, lng: BASE_LNG },
        ],
      },
    ]);

    await enrichGraph(graph, { bounds, providers: [provider] });

    const edge = graph.edges.get("e1")!;
    expect(edge.attributes.speedLimit).toBe(40);
    expect(edge.attributes.enrichment?.["speed-limit"]?.confidence).toBeGreaterThan(0);
  });

  it("returns stats with per-provider and per-attribute breakdowns", async () => {
    const graph = makeGraph();
    const provider = makeMockProvider([
      {
        attribute: "surface",
        source: "gravelmap",
        value: "paved",
        sourceConfidence: 0.9,
        geometry: [
          { lat: BASE_LAT, lng: BASE_LNG },
          { lat: BASE_LAT + 0.0005, lng: BASE_LNG },
        ],
      },
    ]);

    const stats = await enrichGraph(graph, { bounds, providers: [provider] });

    expect(stats.providers).toHaveLength(1);
    expect(stats.totalTimeMs).toBeGreaterThanOrEqual(0);
    expect(stats.attributes.length).toBeGreaterThan(0);
  });

  it("handles failed providers gracefully", async () => {
    const graph = makeGraph();
    const failingProvider: EnrichmentProvider = {
      source: "mapillary",
      name: "Failing Provider",
      provides: ["surface"],
      fetchObservations: async () => {
        throw new Error("API unavailable");
      },
    };

    const stats = await enrichGraph(graph, {
      bounds,
      providers: [failingProvider],
    });

    expect(stats.providers).toHaveLength(1);
    expect(stats.providers[0]!.observationCount).toBe(0);
  });

  it("handles empty provider list", async () => {
    const graph = makeGraph();
    const stats = await enrichGraph(graph, { bounds, providers: [] });
    expect(stats.providers).toHaveLength(0);
    expect(stats.attributes).toHaveLength(0);
  });

  it("supports incremental enrichment (preserves existing observations)", async () => {
    const graph = makeGraph();
    const edge = graph.edges.get("e1")!;

    // Pre-populate with existing enrichment
    edge.attributes.enrichment = {
      surface: {
        confidence: 0.6,
        hasConflict: false,
        observations: [
          {
            attribute: "surface",
            source: "osm-tag",
            value: "paved",
            sourceConfidence: 0.7,
          },
        ],
      },
    };

    const provider = makeMockProvider([
      {
        attribute: "surface",
        source: "gravelmap",
        value: "paved",
        sourceConfidence: 0.9,
        geometry: [
          { lat: BASE_LAT, lng: BASE_LNG },
          { lat: BASE_LAT + 0.0005, lng: BASE_LNG },
        ],
      },
    ]);

    await enrichGraph(graph, { bounds, providers: [provider] });

    // Should have observations from both the existing and new provider
    const enrichment = edge.attributes.enrichment!.surface!;
    expect(enrichment.observations.length).toBeGreaterThanOrEqual(2);
  });
});
