import { describe, it, expect } from "vitest";
import { routeToSegmentFeatures, buildDirectedCoords } from "./route-geojson.js";
import type {
  Route,
  Graph,
  GraphEdge,
  Corridor,
  CorridorSegment,
  ConnectingSegment,
} from "@tailwind-loops/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  geometry: { lat: number; lng: number }[],
): GraphEdge {
  return {
    id,
    fromNodeId,
    toNodeId,
    attributes: {
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
      lengthMeters: 500,
    },
    geometry,
  };
}

function makeGraph(edges: GraphEdge[]): Graph {
  const edgeMap = new Map<string, GraphEdge>();
  for (const e of edges) edgeMap.set(e.id, e);
  return {
    nodes: new Map(),
    edges: edgeMap,
    adjacency: new Map(),
  };
}

function makeCorridor(overrides?: Partial<Corridor>): Corridor {
  return {
    id: "c1",
    type: "rural-road",
    attributes: {
      lengthMeters: 2000,
      predominantRoadClass: "residential",
      predominantSurface: "paved",
      surfaceConfidence: 0.8,
      bicycleInfraContinuity: 0,
      pedestrianPathContinuity: 0,
      separationContinuity: 0,
      stopDensityPerKm: 0,
      crossingDensityPerKm: 0,
      turnsCount: 0,
      trafficCalmingContinuity: 0,
      scenicScore: 0,
    },
    edgeIds: ["e1"],
    startNodeId: "n1",
    endNodeId: "n2",
    geometry: [],
    oneWay: false,
    ...overrides,
  };
}

function makeRoute(segments: Route["segments"]): Route {
  return {
    id: "route-0",
    segments,
    stats: {
      totalDistanceMeters: 5000,
      totalStops: 2,
      distanceByCorridorType: {} as Route["stats"]["distanceByCorridorType"],
      distanceBySurface: { paved: 4000, unpaved: 800, unknown: 200 },
      averageInfrastructureContinuity: 0.5,
      flowScore: 0.75,
      elevationGainMeters: 100,
      elevationLossMeters: 95,
    },
    geometry: [
      { lat: 42.96, lng: -85.67 },
      { lat: 42.97, lng: -85.66 },
      { lat: 42.96, lng: -85.65 },
    ],
    score: 0.823,
  };
}

// ─── buildDirectedCoords ────────────────────────────────────────────────────

describe("buildDirectedCoords", () => {
  it("returns coords in forward order for a single edge", () => {
    const edge = makeEdge("e1", "n1", "n2", [
      { lat: 42.96, lng: -85.67 },
      { lat: 42.97, lng: -85.66 },
    ]);
    const coords = buildDirectedCoords([edge]);
    expect(coords).toEqual([
      [-85.67, 42.96],
      [-85.66, 42.97],
    ]);
  });

  it("chains forward-connected edges correctly", () => {
    // e1: n1→n2, e2: n2→n3 — both forward
    const e1 = makeEdge("e1", "n1", "n2", [
      { lat: 42.96, lng: -85.67 },
      { lat: 42.965, lng: -85.665 },
    ]);
    const e2 = makeEdge("e2", "n2", "n3", [
      { lat: 42.965, lng: -85.665 },
      { lat: 42.97, lng: -85.66 },
    ]);
    const coords = buildDirectedCoords([e1, e2]);
    // Should deduplicate the shared point
    expect(coords).toEqual([
      [-85.67, 42.96],
      [-85.665, 42.965],
      [-85.66, 42.97],
    ]);
  });

  it("reverses the second edge when it shares fromNodeId with first edge's toNodeId", () => {
    // e1: n1→n2 (forward), e2: n3→n2 (needs reversal — enter at n2, exit at n3)
    const e1 = makeEdge("e1", "n1", "n2", [
      { lat: 42.96, lng: -85.67 },
      { lat: 42.965, lng: -85.665 },
    ]);
    const e2 = makeEdge("e2", "n3", "n2", [
      { lat: 42.97, lng: -85.66 },   // n3 end
      { lat: 42.965, lng: -85.665 },  // n2 end (shared with e1)
    ]);
    const coords = buildDirectedCoords([e1, e2]);
    // e2 should be reversed: n2→n3
    expect(coords).toEqual([
      [-85.67, 42.96],
      [-85.665, 42.965],
      [-85.66, 42.97],
    ]);
  });

  it("reverses the first edge when needed", () => {
    // e1: n2→n1 (needs reversal), e2: n2→n3 (forward)
    // Shared node is n2, which is e1.fromNodeId — so e1 must be reversed
    const e1 = makeEdge("e1", "n2", "n1", [
      { lat: 42.965, lng: -85.665 },  // n2
      { lat: 42.96, lng: -85.67 },    // n1
    ]);
    const e2 = makeEdge("e2", "n2", "n3", [
      { lat: 42.965, lng: -85.665 },  // n2
      { lat: 42.97, lng: -85.66 },    // n3
    ]);
    const coords = buildDirectedCoords([e1, e2]);
    // e1 reversed (n1→n2), e2 forward (n2→n3)
    expect(coords).toEqual([
      [-85.67, 42.96],
      [-85.665, 42.965],
      [-85.66, 42.97],
    ]);
  });

  it("handles a chain of three edges with mixed directions", () => {
    // e1: n1→n2 (forward), e2: n3→n2 (reversed), e3: n3→n4 (forward)
    const e1 = makeEdge("e1", "n1", "n2", [
      { lat: 1, lng: 10 },
      { lat: 2, lng: 20 },
    ]);
    const e2 = makeEdge("e2", "n3", "n2", [
      { lat: 3, lng: 30 },
      { lat: 2, lng: 20 },
    ]);
    const e3 = makeEdge("e3", "n3", "n4", [
      { lat: 3, lng: 30 },
      { lat: 4, lng: 40 },
    ]);
    const coords = buildDirectedCoords([e1, e2, e3]);
    expect(coords).toEqual([
      [10, 1],
      [20, 2],
      [30, 3],
      [40, 4],
    ]);
  });

  it("returns empty array for no edges", () => {
    expect(buildDirectedCoords([])).toEqual([]);
  });
});

// ─── routeToSegmentFeatures ─────────────────────────────────────────────────

describe("routeToSegmentFeatures", () => {
  describe("corridor segments", () => {
    it("produces a LineString feature for a corridor segment", () => {
      const edge = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.965, lng: -85.665 },
        { lat: 42.97, lng: -85.66 },
      ]);
      const graph = makeGraph([edge]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor({ name: "Main St" }),
        reversed: false,
        traversedEdgeIds: ["e1"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeatures = features.filter((f) => f.properties["isSegment"] === true);
      expect(segFeatures).toHaveLength(1);

      const f = segFeatures[0]!;
      expect(f.type).toBe("Feature");
      expect(f.geometry.type).toBe("LineString");
      expect(f.geometry.coordinates).toHaveLength(3);
      expect(f.geometry.coordinates[0]).toEqual([-85.67, 42.96]);
      expect(f.properties["corridorName"]).toBe("Main St");
      expect(f.properties["corridorType"]).toBe("rural-road");
      expect(f.properties["surface"]).toBe("paved");
    });

    it("uses unpaved color for unpaved corridor segments", () => {
      const edge = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.97, lng: -85.66 },
      ]);
      const graph = makeGraph([edge]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor({
          attributes: {
            ...makeCorridor().attributes,
            predominantSurface: "unpaved",
          },
        }),
        reversed: false,
        traversedEdgeIds: ["e1"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeature = features.find((f) => f.properties["isSegment"]);
      expect(segFeature!.properties["stroke"]).toBe("#d97706");
      expect(segFeature!.properties["surface"]).toBe("unpaved");
    });

    it("skips missing edges gracefully", () => {
      const graph = makeGraph([]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor(),
        reversed: false,
        traversedEdgeIds: ["missing-edge"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeatures = features.filter((f) => f.properties["isSegment"] === true);
      expect(segFeatures).toHaveLength(0);
    });
  });

  describe("connecting segments", () => {
    it("produces a LineString feature for a connecting segment", () => {
      const edge = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.97, lng: -85.66 },
      ]);
      const graph = makeGraph([edge]);
      const seg: ConnectingSegment = {
        kind: "connecting",
        edges: [edge],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeature = features.find((f) => f.properties["isSegment"]);
      expect(segFeature!.properties["corridorType"]).toBe("connector");
      expect(segFeature!.properties["corridorName"]).toBeNull();
    });
  });

  describe("coordinate deduplication", () => {
    it("removes duplicate coordinates at segment joins", () => {
      const e1 = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.965, lng: -85.665 },
      ]);
      const e2 = makeEdge("e2", "n2", "n3", [
        { lat: 42.965, lng: -85.665 },
        { lat: 42.97, lng: -85.66 },
      ]);
      const graph = makeGraph([e1, e2]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor(),
        reversed: false,
        traversedEdgeIds: ["e1", "e2"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeature = features.find((f) => f.properties["isSegment"]);
      expect(segFeature!.geometry.coordinates).toHaveLength(3);
    });
  });

  describe("edge direction reversal", () => {
    it("reverses edge geometry when traversed backward in a corridor", () => {
      // e1: n1→n2 forward, e2: n3→n2 needs reversal
      const e1 = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.965, lng: -85.665 },
      ]);
      const e2 = makeEdge("e2", "n3", "n2", [
        { lat: 42.97, lng: -85.66 },
        { lat: 42.965, lng: -85.665 },
      ]);
      const graph = makeGraph([e1, e2]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor(),
        reversed: false,
        traversedEdgeIds: ["e1", "e2"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeature = features.find((f) => f.properties["isSegment"]);
      // Should produce a clean path: start → middle → end
      expect(segFeature!.geometry.coordinates).toEqual([
        [-85.67, 42.96],
        [-85.665, 42.965],
        [-85.66, 42.97],
      ]);
    });

    it("reverses connector edge geometry when traversed backward", () => {
      // Connector with two edges, second one reversed
      const e1 = makeEdge("e1", "n1", "n2", [
        { lat: 1, lng: 10 },
        { lat: 2, lng: 20 },
      ]);
      const e2 = makeEdge("e2", "n3", "n2", [
        { lat: 3, lng: 30 },
        { lat: 2, lng: 20 },
      ]);
      const graph = makeGraph([e1, e2]);
      const seg: ConnectingSegment = {
        kind: "connecting",
        edges: [e1, e2],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeature = features.find((f) => f.properties["isSegment"]);
      expect(segFeature!.geometry.coordinates).toEqual([
        [10, 1],
        [20, 2],
        [30, 3],
      ]);
    });
  });

  describe("primary vs alternative styling", () => {
    it("uses primary styling for routeIndex 0", () => {
      const edge = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.97, lng: -85.66 },
      ]);
      const graph = makeGraph([edge]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor(),
        reversed: false,
        traversedEdgeIds: ["e1"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeature = features.find((f) => f.properties["isSegment"]);
      expect(segFeature!.properties["isPrimary"]).toBe(true);
      expect(segFeature!.properties["stroke"]).toBe("#2563eb");
      expect(segFeature!.properties["stroke-width"]).toBe(4);
      expect(segFeature!.properties["stroke-opacity"]).toBe(0.9);
    });

    it("uses alternative styling for routeIndex > 0", () => {
      const edge = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.97, lng: -85.66 },
      ]);
      const graph = makeGraph([edge]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor(),
        reversed: false,
        traversedEdgeIds: ["e1"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 2, graph);

      const segFeature = features.find((f) => f.properties["isSegment"]);
      expect(segFeature!.properties["isPrimary"]).toBe(false);
      expect(segFeature!.properties["routeIndex"]).toBe(2);
      expect(segFeature!.properties["stroke"]).toBe("#9333ea");
      expect(segFeature!.properties["stroke-width"]).toBe(3);
      expect(segFeature!.properties["stroke-opacity"]).toBe(0.6);
    });
  });

  describe("summary feature", () => {
    it("always produces a route-level summary feature", () => {
      const edge = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.97, lng: -85.66 },
      ]);
      const graph = makeGraph([edge]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor(),
        reversed: false,
        traversedEdgeIds: ["e1"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const summary = features.find((f) => f.properties["isSegment"] === false);
      expect(summary).toBeDefined();
      expect(summary!.properties["score"]).toBe(0.823);
      expect(summary!.properties["distanceMeters"]).toBe(5000);
      expect(summary!.properties["totalStops"]).toBe(2);
      expect(summary!.properties["flowScore"]).toBe(0.75);
    });

    it("uses route geometry for summary feature coordinates", () => {
      const graph = makeGraph([]);
      const route = makeRoute([]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const summary = features.find((f) => f.properties["isSegment"] === false);
      expect(summary!.geometry.coordinates).toHaveLength(3);
      expect(summary!.geometry.coordinates[0]).toEqual([-85.67, 42.96]);
    });

    it("renders summary feature invisible (0 stroke width/opacity)", () => {
      const graph = makeGraph([]);
      const route = makeRoute([]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const summary = features.find((f) => f.properties["isSegment"] === false);
      expect(summary!.properties["stroke-width"]).toBe(0);
      expect(summary!.properties["stroke-opacity"]).toBe(0);
    });
  });

  describe("multi-segment routes", () => {
    it("produces one segment feature per segment plus one summary", () => {
      const e1 = makeEdge("e1", "n1", "n2", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.965, lng: -85.665 },
      ]);
      const e2 = makeEdge("e2", "n2", "n3", [
        { lat: 42.965, lng: -85.665 },
        { lat: 42.97, lng: -85.66 },
      ]);
      const graph = makeGraph([e1, e2]);

      const seg1: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor({ id: "c1", name: "First St" }),
        reversed: false,
        traversedEdgeIds: ["e1"],
      };
      const seg2: ConnectingSegment = {
        kind: "connecting",
        edges: [e2],
      };
      const route = makeRoute([seg1, seg2]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const segFeatures = features.filter((f) => f.properties["isSegment"]);
      const summaryFeatures = features.filter((f) => !f.properties["isSegment"]);

      expect(segFeatures).toHaveLength(2);
      expect(summaryFeatures).toHaveLength(1);
      expect(segFeatures[0]!.properties["corridorName"]).toBe("First St");
      expect(segFeatures[1]!.properties["corridorType"]).toBe("connector");
    });
  });
});
