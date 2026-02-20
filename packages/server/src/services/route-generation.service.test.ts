import { describe, it, expect } from "vitest";
import { routeToSegmentFeatures } from "./route-generation.service.js";
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
  geometry: { lat: number; lng: number }[],
): GraphEdge {
  return {
    id,
    fromNodeId: "n1",
    toNodeId: "n2",
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

// ─── routeToSegmentFeatures ─────────────────────────────────────────────────

describe("routeToSegmentFeatures", () => {
  describe("corridor segments", () => {
    it("produces a LineString feature for a corridor segment", () => {
      const edge = makeEdge("e1", [
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

      // Should produce segment feature + summary feature
      const segFeatures = features.filter(
        (f: any) => f.properties.isSegment === true,
      );
      expect(segFeatures).toHaveLength(1);

      const f = segFeatures[0] as any;
      expect(f.type).toBe("Feature");
      expect(f.geometry.type).toBe("LineString");
      expect(f.geometry.coordinates).toHaveLength(3);
      // GeoJSON uses [lng, lat] order
      expect(f.geometry.coordinates[0]).toEqual([-85.67, 42.96]);
      expect(f.properties.corridorName).toBe("Main St");
      expect(f.properties.corridorType).toBe("rural-road");
      expect(f.properties.surface).toBe("paved");
    });

    it("uses unpaved color for unpaved corridor segments", () => {
      const edge = makeEdge("e1", [
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

      const segFeature = (features as any[]).find(
        (f) => f.properties.isSegment,
      );
      expect(segFeature.properties.stroke).toBe("#d97706"); // primary unpaved
      expect(segFeature.properties.surface).toBe("unpaved");
    });

    it("skips missing edges gracefully", () => {
      // Graph has no edges — segment references a nonexistent edge
      const graph = makeGraph([]);
      const seg: CorridorSegment = {
        kind: "corridor",
        corridor: makeCorridor(),
        reversed: false,
        traversedEdgeIds: ["missing-edge"],
      };
      const route = makeRoute([seg]);
      const features = routeToSegmentFeatures(route, 0, graph);

      // Only the summary feature should be produced (no segment features since < 2 coords)
      const segFeatures = (features as any[]).filter(
        (f) => f.properties.isSegment === true,
      );
      expect(segFeatures).toHaveLength(0);
    });
  });

  describe("connecting segments", () => {
    it("produces a LineString feature for a connecting segment", () => {
      const edge = makeEdge("e1", [
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

      const segFeature = (features as any[]).find(
        (f) => f.properties.isSegment,
      );
      expect(segFeature.properties.corridorType).toBe("connector");
      expect(segFeature.properties.corridorName).toBeNull();
    });
  });

  describe("coordinate deduplication", () => {
    it("removes duplicate coordinates at segment joins", () => {
      // Two edges that share a point at the join
      const e1 = makeEdge("e1", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.965, lng: -85.665 },
      ]);
      const e2 = makeEdge("e2", [
        { lat: 42.965, lng: -85.665 }, // duplicate of e1's last point
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

      const segFeature = (features as any[]).find(
        (f) => f.properties.isSegment,
      );
      // Should have 3 unique points, not 4
      expect(segFeature.geometry.coordinates).toHaveLength(3);
    });
  });

  describe("primary vs alternative styling", () => {
    it("uses primary styling for routeIndex 0", () => {
      const edge = makeEdge("e1", [
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

      const segFeature = (features as any[]).find(
        (f) => f.properties.isSegment,
      );
      expect(segFeature.properties.isPrimary).toBe(true);
      expect(segFeature.properties.stroke).toBe("#2563eb"); // primary blue
      expect(segFeature.properties["stroke-width"]).toBe(4);
      expect(segFeature.properties["stroke-opacity"]).toBe(0.9);
    });

    it("uses alternative styling for routeIndex > 0", () => {
      const edge = makeEdge("e1", [
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

      const segFeature = (features as any[]).find(
        (f) => f.properties.isSegment,
      );
      expect(segFeature.properties.isPrimary).toBe(false);
      expect(segFeature.properties.routeIndex).toBe(2);
      expect(segFeature.properties.stroke).toBe("#9333ea"); // alt purple
      expect(segFeature.properties["stroke-width"]).toBe(3);
      expect(segFeature.properties["stroke-opacity"]).toBe(0.6);
    });

    it("uses alternative unpaved color for routeIndex > 0 with unpaved", () => {
      const edge = makeEdge("e1", [
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
      const features = routeToSegmentFeatures(route, 1, graph);

      const segFeature = (features as any[]).find(
        (f) => f.properties.isSegment,
      );
      expect(segFeature.properties.stroke).toBe("#b45309"); // alt unpaved
    });
  });

  describe("summary feature", () => {
    it("always produces a route-level summary feature", () => {
      const edge = makeEdge("e1", [
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

      const summary = (features as any[]).find(
        (f) => f.properties.isSegment === false,
      );
      expect(summary).toBeDefined();
      expect(summary.properties.score).toBe(0.823);
      expect(summary.properties.distanceMeters).toBe(5000);
      expect(summary.properties.distanceKm).toBe(5); // Math.round(5000/100)/10 = 5.0km
      expect(summary.properties.totalStops).toBe(2);
      expect(summary.properties.flowScore).toBe(0.75);
      expect(summary.properties.segmentCount).toBe(1);
      expect(summary.properties.elevationGain).toBe(100);
      expect(summary.properties.elevationLoss).toBe(95);
      expect(summary.properties.surfacePaved).toBe(4000);
      expect(summary.properties.surfaceUnpaved).toBe(800);
      expect(summary.properties.surfaceUnknown).toBe(200);
    });

    it("uses route geometry for summary feature coordinates", () => {
      const graph = makeGraph([]);
      const route = makeRoute([]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const summary = (features as any[]).find(
        (f) => f.properties.isSegment === false,
      );
      expect(summary.geometry.coordinates).toHaveLength(3);
      expect(summary.geometry.coordinates[0]).toEqual([-85.67, 42.96]);
    });

    it("renders summary feature invisible (0 stroke width/opacity)", () => {
      const graph = makeGraph([]);
      const route = makeRoute([]);
      const features = routeToSegmentFeatures(route, 0, graph);

      const summary = (features as any[]).find(
        (f) => f.properties.isSegment === false,
      );
      expect(summary.properties["stroke-width"]).toBe(0);
      expect(summary.properties["stroke-opacity"]).toBe(0);
      expect(summary.properties.stroke).toBe("#000000");
    });

    it("handles missing elevation and surface data gracefully", () => {
      const graph = makeGraph([]);
      const route: Route = {
        id: "route-0",
        segments: [],
        stats: {
          totalDistanceMeters: 1000,
          totalStops: 0,
          distanceByCorridorType:
            {} as Route["stats"]["distanceByCorridorType"],
          distanceBySurface: undefined as any,
          averageInfrastructureContinuity: 0,
          flowScore: 0,
        },
        geometry: [{ lat: 42.96, lng: -85.67 }],
        score: 0.5,
      };
      const features = routeToSegmentFeatures(route, 0, graph);

      const summary = (features as any[]).find(
        (f) => f.properties.isSegment === false,
      );
      expect(summary.properties.elevationGain).toBeNull();
      expect(summary.properties.elevationLoss).toBeNull();
      expect(summary.properties.surfacePaved).toBe(0);
      expect(summary.properties.surfaceUnpaved).toBe(0);
      expect(summary.properties.surfaceUnknown).toBe(0);
    });
  });

  describe("multi-segment routes", () => {
    it("produces one segment feature per segment plus one summary", () => {
      const e1 = makeEdge("e1", [
        { lat: 42.96, lng: -85.67 },
        { lat: 42.965, lng: -85.665 },
      ]);
      const e2 = makeEdge("e2", [
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

      const segFeatures = (features as any[]).filter(
        (f) => f.properties.isSegment,
      );
      const summaryFeatures = (features as any[]).filter(
        (f) => !f.properties.isSegment,
      );

      expect(segFeatures).toHaveLength(2);
      expect(summaryFeatures).toHaveLength(1);
      expect(segFeatures[0].properties.corridorName).toBe("First St");
      expect(segFeatures[1].properties.corridorType).toBe("connector");
    });
  });
});
