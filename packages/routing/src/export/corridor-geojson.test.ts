import { describe, it, expect } from "vitest";
import {
  corridorNetworkToGeoJson,
  corridorsByTypeToGeoJson,
} from "./corridor-geojson.js";
import type {
  CorridorNetwork,
  Corridor,
  Connector,
  CorridorType,
} from "@tailwind-loops/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCorridor(overrides: Partial<Corridor> = {}): Corridor {
  return {
    id: "corridor-0",
    name: "Main Street",
    type: "quiet-road",
    attributes: {
      lengthMeters: 500,
      predominantRoadClass: "residential",
      predominantSurface: "asphalt",
      surfaceConfidence: 0.8,
      infrastructureContinuity: 0,
      separationContinuity: 0,
      stopDensityPerKm: 1,
      turnsCount: 0,
      scenicScore: 0,
    },
    edgeIds: ["e1", "e2"],
    startNodeId: "a",
    endNodeId: "c",
    geometry: [
      { lat: 42.96, lng: -85.66 },
      { lat: 42.961, lng: -85.66 },
      { lat: 42.962, lng: -85.66 },
    ],
    oneWay: false,
    ...overrides,
  };
}

function makeConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    id: "connector-0",
    edgeIds: ["e3"],
    corridorIds: ["corridor-0", "corridor-1"],
    startNodeId: "c",
    endNodeId: "d",
    attributes: {
      lengthMeters: 50,
      crossesMajorRoad: false,
      hasSignal: false,
      hasStop: false,
      crossingDifficulty: 0.1,
    },
    geometry: [
      { lat: 42.962, lng: -85.66 },
      { lat: 42.962, lng: -85.659 },
    ],
    ...overrides,
  };
}

function makeNetwork(
  corridors: Corridor[] = [],
  connectors: Connector[] = []
): CorridorNetwork {
  const corridorMap = new Map<string, Corridor>();
  for (const c of corridors) corridorMap.set(c.id, c);
  const connectorMap = new Map<string, Connector>();
  for (const c of connectors) connectorMap.set(c.id, c);
  return {
    corridors: corridorMap,
    connectors: connectorMap,
    adjacency: new Map(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("corridorNetworkToGeoJson", () => {
  it("exports corridors as LineString features", () => {
    const network = makeNetwork([makeCorridor()]);
    const geojson = corridorNetworkToGeoJson(network, {
      includeConnectors: false,
    });

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(1);

    const f = geojson.features[0]!;
    expect(f.type).toBe("Feature");
    expect(f.geometry.type).toBe("LineString");
    expect(f.geometry.coordinates).toHaveLength(3);
    expect(f.properties["featureType"]).toBe("corridor");
    expect(f.properties["corridorType"]).toBe("quiet-road");
    expect(f.properties["name"]).toBe("Main Street");
  });

  it("includes connectors by default", () => {
    const network = makeNetwork([makeCorridor()], [makeConnector()]);
    const geojson = corridorNetworkToGeoJson(network);

    expect(geojson.features).toHaveLength(2);
    const types = geojson.features.map((f) => f.properties["featureType"]);
    expect(types).toContain("corridor");
    expect(types).toContain("connector");
  });

  it("excludes connectors when includeConnectors is false", () => {
    const network = makeNetwork([makeCorridor()], [makeConnector()]);
    const geojson = corridorNetworkToGeoJson(network, {
      includeConnectors: false,
    });

    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0]!.properties["featureType"]).toBe("corridor");
  });

  it("filters by corridor type", () => {
    const corridors = [
      makeCorridor({ id: "c0", type: "trail" }),
      makeCorridor({ id: "c1", type: "arterial" }),
      makeCorridor({ id: "c2", type: "quiet-road" }),
    ];
    const network = makeNetwork(corridors);
    const geojson = corridorNetworkToGeoJson(network, {
      corridorTypes: ["trail"],
      includeConnectors: false,
    });

    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0]!.properties["corridorType"]).toBe("trail");
  });

  it("filters by minimum length", () => {
    const corridors = [
      makeCorridor({
        id: "c0",
        attributes: {
          ...makeCorridor().attributes,
          lengthMeters: 100,
        },
      }),
      makeCorridor({
        id: "c1",
        attributes: {
          ...makeCorridor().attributes,
          lengthMeters: 1000,
        },
      }),
    ];
    const network = makeNetwork(corridors);
    const geojson = corridorNetworkToGeoJson(network, {
      minLengthMeters: 500,
      includeConnectors: false,
    });

    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0]!.properties["lengthMeters"]).toBe(1000);
  });

  it("includes stroke styling by default", () => {
    const network = makeNetwork([makeCorridor({ type: "trail" })]);
    const geojson = corridorNetworkToGeoJson(network, {
      includeConnectors: false,
    });

    const props = geojson.features[0]!.properties;
    expect(props["stroke"]).toBe("#2ecc71");
    expect(props["stroke-width"]).toBe(4);
    expect(props["stroke-opacity"]).toBe(0.85);
  });

  it("omits stroke styling when includeStyle is false", () => {
    const network = makeNetwork([makeCorridor()]);
    const geojson = corridorNetworkToGeoJson(network, {
      includeStyle: false,
      includeConnectors: false,
    });

    const props = geojson.features[0]!.properties;
    expect(props["stroke"]).toBeUndefined();
    expect(props["stroke-width"]).toBeUndefined();
  });

  it("includes corridor attributes in properties", () => {
    const network = makeNetwork([makeCorridor({ oneWay: true })]);
    const geojson = corridorNetworkToGeoJson(network, {
      includeConnectors: false,
    });

    const props = geojson.features[0]!.properties;
    expect(props["oneWay"]).toBe(true);
    expect(props["roadClass"]).toBe("residential");
    expect(props["surface"]).toBe("asphalt");
    expect(props["edgeCount"]).toBe(2);
    expect(props["lengthKm"]).toBe(0.5);
  });

  it("includes connector attributes in properties", () => {
    const connector = makeConnector({
      attributes: {
        lengthMeters: 75,
        crossesMajorRoad: true,
        hasSignal: true,
        hasStop: false,
        crossingDifficulty: 0.7,
      },
    });
    const network = makeNetwork([], [connector]);
    const geojson = corridorNetworkToGeoJson(network);

    const props = geojson.features[0]!.properties;
    expect(props["featureType"]).toBe("connector");
    expect(props["crossesMajorRoad"]).toBe(true);
    expect(props["hasSignal"]).toBe(true);
    expect(props["crossingDifficulty"]).toBe(0.7);
  });

  it("skips corridors with fewer than 2 geometry points", () => {
    const corridor = makeCorridor({
      geometry: [{ lat: 42.96, lng: -85.66 }],
    });
    const network = makeNetwork([corridor]);
    const geojson = corridorNetworkToGeoJson(network, {
      includeConnectors: false,
    });

    expect(geojson.features).toHaveLength(0);
  });

  it("uses correct color per corridor type", () => {
    const types: CorridorType[] = [
      "trail",
      "path",
      "quiet-road",
      "collector",
      "arterial",
      "mixed",
    ];
    const expectedColors: Record<string, string> = {
      trail: "#2ecc71",
      path: "#27ae60",
      "quiet-road": "#3498db",
      collector: "#f39c12",
      arterial: "#e74c3c",
      mixed: "#9b59b6",
    };

    for (const type of types) {
      const network = makeNetwork([makeCorridor({ id: type, type })]);
      const geojson = corridorNetworkToGeoJson(network, {
        includeConnectors: false,
      });
      expect(geojson.features[0]!.properties["stroke"]).toBe(
        expectedColors[type]
      );
    }
  });

  it("returns empty collection for empty network", () => {
    const network = makeNetwork();
    const geojson = corridorNetworkToGeoJson(network);
    expect(geojson.features).toHaveLength(0);
  });
});

describe("corridorsByTypeToGeoJson", () => {
  it("groups corridors by type into separate collections", () => {
    const corridors = [
      makeCorridor({ id: "c0", type: "trail" }),
      makeCorridor({ id: "c1", type: "trail" }),
      makeCorridor({ id: "c2", type: "arterial" }),
    ];
    const network = makeNetwork(corridors);
    const byType = corridorsByTypeToGeoJson(network);

    expect(byType.size).toBe(2);
    expect(byType.get("trail")!.features).toHaveLength(2);
    expect(byType.get("arterial")!.features).toHaveLength(1);
  });

  it("returns empty map for empty network", () => {
    const network = makeNetwork();
    const byType = corridorsByTypeToGeoJson(network);
    expect(byType.size).toBe(0);
  });
});

describe("score-colored export", () => {
  it("adds score properties when scoreActivity is set", () => {
    const corridor = makeCorridor();
    corridor.scores = {
      "road-cycling": {
        overall: 0.75,
        flow: 0.8,
        safety: 0.6,
        surface: 0.9,
        character: 0.7,
        scenic: 0,
      },
    };
    const network = makeNetwork([corridor]);
    const geojson = corridorNetworkToGeoJson(network, {
      scoreActivity: "road-cycling",
      includeConnectors: false,
    });

    const props = geojson.features[0]!.properties;
    expect(props["scoreOverall"]).toBe(0.75);
    expect(props["scoreFlow"]).toBe(0.8);
    expect(props["scoreSafety"]).toBe(0.6);
    expect(props["scoreSurface"]).toBe(0.9);
    expect(props["scoreCharacter"]).toBe(0.7);
  });

  it("uses score-based gradient color instead of type color", () => {
    const corridor = makeCorridor({ type: "arterial" });
    corridor.scores = {
      "road-cycling": {
        overall: 0.5,
        flow: 0.5,
        safety: 0.5,
        surface: 0.5,
        character: 0.5,
        scenic: 0,
      },
    };
    const network = makeNetwork([corridor]);

    // Without score: should use arterial color
    const noScore = corridorNetworkToGeoJson(network, { includeConnectors: false });
    expect(noScore.features[0]!.properties["stroke"]).toBe("#e74c3c");

    // With score: should use hex gradient (score 0.5 = yellow = #cccc22)
    const withScore = corridorNetworkToGeoJson(network, {
      scoreActivity: "road-cycling",
      includeConnectors: false,
    });
    expect(withScore.features[0]!.properties["stroke"]).toBe("#cccc22");
  });

  it("falls back to type color when corridor has no score for activity", () => {
    const corridor = makeCorridor({ type: "trail" });
    // No scores set
    const network = makeNetwork([corridor]);
    const geojson = corridorNetworkToGeoJson(network, {
      scoreActivity: "road-cycling",
      includeConnectors: false,
    });

    expect(geojson.features[0]!.properties["stroke"]).toBe("#2ecc71");
  });
});
