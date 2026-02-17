import { describe, it, expect } from "vitest";
import { graphToGeoJson } from "./geojson.js";
import type { Graph, GraphNode, GraphEdge, EdgeAttributes, SurfaceClassification, Infrastructure } from "../domain/index.js";

function makeSurface(surface: SurfaceClassification["surface"] = "paved", confidence = 0.6): SurfaceClassification {
  return {
    surface,
    confidence,
    observations: [{ source: "osm-highway-inferred", surface, sourceConfidence: 1.0 }],
    hasConflict: false,
  };
}

function makeInfra(): Infrastructure {
  return { hasDedicatedPath: false, hasShoulder: false, isSeparated: false };
}

function makeEdge(id: string, from: string, to: string, overrides: Partial<EdgeAttributes> = {}): GraphEdge {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    osmWayId: "100",
    geometry: [
      { lat: 42.96, lng: -85.66 },
      { lat: 42.97, lng: -85.66 },
    ],
    attributes: {
      roadClass: "residential",
      surfaceClassification: makeSurface(),
      infrastructure: makeInfra(),
      oneWay: false,
      lengthMeters: 150,
      ...overrides,
    },
  };
}

function makeGraph(edges: GraphEdge[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const adjacency = new Map<string, string[]>();

  for (const e of edges) {
    edgeMap.set(e.id, e);
    if (!nodes.has(e.fromNodeId)) {
      nodes.set(e.fromNodeId, { id: e.fromNodeId, coordinate: e.geometry[0]! });
    }
    if (!nodes.has(e.toNodeId)) {
      nodes.set(e.toNodeId, { id: e.toNodeId, coordinate: e.geometry[e.geometry.length - 1]! });
    }
  }

  return { nodes, edges: edgeMap, adjacency };
}

describe("graphToGeoJson", () => {
  it("exports edges as LineString features", () => {
    const graph = makeGraph([makeEdge("e1", "n1", "n2")]);
    const result = graphToGeoJson(graph);

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    expect(result.features[0]!.geometry.type).toBe("LineString");
    expect(result.features[0]!.properties['roadClass']).toBe("residential");
    expect(result.features[0]!.properties['surface']).toBe("paved");
  });

  it("uses [lng, lat] coordinate order", () => {
    const graph = makeGraph([makeEdge("e1", "n1", "n2")]);
    const result = graphToGeoJson(graph);
    const coords = (result.features[0]!.geometry as any).coordinates;

    // GeoJSON is [lng, lat]
    expect(coords[0][0]).toBe(-85.66); // lng
    expect(coords[0][1]).toBe(42.96);  // lat
  });

  it("filters by road class", () => {
    const graph = makeGraph([
      makeEdge("e1", "n1", "n2", { roadClass: "cycleway" }),
      makeEdge("e2", "n3", "n4", { roadClass: "residential" }),
    ]);
    const result = graphToGeoJson(graph, { roadClasses: ["cycleway"] });
    expect(result.features).toHaveLength(1);
    expect(result.features[0]!.properties['roadClass']).toBe("cycleway");
  });

  it("filters by surface type", () => {
    const graph = makeGraph([
      makeEdge("e1", "n1", "n2", { surfaceClassification: makeSurface("gravel") }),
      makeEdge("e2", "n3", "n4", { surfaceClassification: makeSurface("paved") }),
    ]);
    const result = graphToGeoJson(graph, { surfaceTypes: ["gravel"] });
    expect(result.features).toHaveLength(1);
    expect(result.features[0]!.properties['surface']).toBe("gravel");
  });

  it("deduplicates bidirectional edges", () => {
    const graph = makeGraph([
      makeEdge("100:0:f", "n1", "n2"),
      makeEdge("100:0:r", "n2", "n1"),
    ]);
    const result = graphToGeoJson(graph, { deduplicateBidirectional: true });
    expect(result.features).toHaveLength(1);
  });

  it("includes nodes when requested", () => {
    const graph = makeGraph([makeEdge("e1", "n1", "n2")]);
    const result = graphToGeoJson(graph, { includeNodes: true });
    const nodeFeatures = result.features.filter((f) => f.properties['featureType'] === "node");
    expect(nodeFeatures.length).toBeGreaterThanOrEqual(1);
    expect(nodeFeatures[0]!.geometry.type).toBe("Point");
  });

  it("returns empty collection for empty graph", () => {
    const graph: Graph = { nodes: new Map(), edges: new Map(), adjacency: new Map() };
    const result = graphToGeoJson(graph);
    expect(result.features).toHaveLength(0);
  });
});
