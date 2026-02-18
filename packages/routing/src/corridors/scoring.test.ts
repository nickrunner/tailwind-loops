import { describe, it, expect } from "vitest";
import {
  scoreFlow,
  scoreSafety,
  scoreSurface,
  scoreCharacter,
  scoreScenic,
  scoreCorridor,
  scoreCorridors,
  DEFAULT_SCORING_WEIGHTS,
} from "./scoring.js";
import type { Corridor, CorridorType } from "@tailwind-loops/types";
import type { ActivityType } from "@tailwind-loops/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCorridor(overrides: Partial<Corridor>): Corridor {
  return {
    id: "test",
    type: "mixed",
    attributes: {
      lengthMeters: 500,
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
    edgeIds: [],
    startNodeId: "a",
    endNodeId: "b",
    geometry: [],
    oneWay: false,
    ...overrides,
  };
}

// ─── scoreFlow ──────────────────────────────────────────────────────────────

describe("scoreFlow", () => {
  it("short corridor (<500m) scores lower than long (>5km)", () => {
    const short = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        lengthMeters: 400,
        stopDensityPerKm: 1,
      },
    });
    const long = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        lengthMeters: 6000,
        stopDensityPerKm: 1,
      },
    });
    expect(scoreFlow(short)).toBeLessThan(scoreFlow(long));
  });

  it("high stop density (8/km) scores lower than low (0.5/km)", () => {
    const highStops = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        lengthMeters: 2000,
        stopDensityPerKm: 8,
      },
    });
    const lowStops = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        lengthMeters: 2000,
        stopDensityPerKm: 0.5,
      },
    });
    expect(scoreFlow(highStops)).toBeLessThan(scoreFlow(lowStops));
  });

  it("zero-length corridor does not crash", () => {
    const zero = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        lengthMeters: 0,
        stopDensityPerKm: 0,
      },
    });
    const score = scoreFlow(zero);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(Number.isFinite(score)).toBe(true);
  });
});

// ─── scoreSafety ────────────────────────────────────────────────────────────

describe("scoreSafety", () => {
  it("cycleway with full infra/separation scores >=0.8", () => {
    const safe = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantRoadClass: "cycleway",
        bicycleInfraContinuity: 1,
        pedestrianPathContinuity: 0,
        separationContinuity: 1,
        averageSpeedLimit: 30,
      },
    });
    expect(scoreSafety(safe)).toBeGreaterThanOrEqual(0.8);
  });

  it("primary road with no infra and speed 70 scores <0.2", () => {
    const unsafe = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantRoadClass: "primary",
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        averageSpeedLimit: 70,
      },
    });
    expect(scoreSafety(unsafe)).toBeLessThan(0.2);
  });

  it("missing speed limit is handled gracefully", () => {
    const noSpeed = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantRoadClass: "residential",
        bicycleInfraContinuity: 0.5,
        pedestrianPathContinuity: 0,
        separationContinuity: 0.5,
      },
    });
    const score = scoreSafety(noSpeed);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(Number.isFinite(score)).toBe(true);
  });
});

// ─── scoreSurface ───────────────────────────────────────────────────────────

describe("scoreSurface", () => {
  it("paved scores >0.9 for cycling with confidence 1.0", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "paved",
        surfaceConfidence: 1.0,
      },
    });
    expect(scoreSurface(corridor, "road-cycling")).toBeGreaterThan(0.9);
  });

  it("unpaved scores 0 for cycling", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "unpaved",
        surfaceConfidence: 1.0,
      },
    });
    // Road cycling must avoid unpaved — score should be 0
    expect(scoreSurface(corridor, "road-cycling")).toBe(0.0);
  });

  it("unpaved scores high for running", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "unpaved",
        surfaceConfidence: 1.0,
      },
    });
    expect(scoreSurface(corridor, "running")).toBeGreaterThan(0.7);
  });

  it("low confidence penalizes score", () => {
    const highConf = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "paved",
        surfaceConfidence: 1.0,
      },
    });
    const lowConf = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "paved",
        surfaceConfidence: 0.2,
      },
    });
    expect(scoreSurface(lowConf, "road-cycling")).toBeLessThan(
      scoreSurface(highConf, "road-cycling"),
    );
  });

  it("walking is permissive (all surfaces >=0.5)", () => {
    const surfaces = [
      "paved",
      "unpaved",
      "unknown",
    ] as const;
    for (const surface of surfaces) {
      const corridor = makeCorridor({
        attributes: {
          ...makeCorridor({}).attributes,
          predominantSurface: surface,
          surfaceConfidence: 1.0,
        },
      });
      expect(scoreSurface(corridor, "walking")).toBeGreaterThanOrEqual(0.5);
    }
  });
});

// ─── scoreCharacter ─────────────────────────────────────────────────────────

describe("scoreCharacter", () => {
  it("rural-road scores 0.9 for road cycling", () => {
    const corridor = makeCorridor({ type: "rural-road" });
    expect(scoreCharacter(corridor, "road-cycling")).toBe(0.9);
  });

  it("trail scores 1.0 for gravel cycling", () => {
    const corridor = makeCorridor({ type: "trail" });
    expect(scoreCharacter(corridor, "gravel-cycling")).toBe(1.0);
  });

  it("arterial scores low for running and walking", () => {
    const corridor = makeCorridor({ type: "arterial" });
    const activities: ActivityType[] = ["running", "walking"];
    for (const activity of activities) {
      expect(scoreCharacter(corridor, activity)).toBeLessThanOrEqual(0.2);
    }
  });

  it("high crossing density reduces character score for road cycling", () => {
    const low = makeCorridor({
      type: "collector",
      attributes: { ...makeCorridor({}).attributes, crossingDensityPerKm: 2 },
    });
    const high = makeCorridor({
      type: "collector",
      attributes: { ...makeCorridor({}).attributes, crossingDensityPerKm: 10 },
    });
    expect(scoreCharacter(high, "road-cycling")).toBeLessThan(
      scoreCharacter(low, "road-cycling")
    );
  });

  it("crossing density has no effect for walking (decay rate 0)", () => {
    const low = makeCorridor({
      type: "neighborhood",
      attributes: { ...makeCorridor({}).attributes, crossingDensityPerKm: 0 },
    });
    const high = makeCorridor({
      type: "neighborhood",
      attributes: { ...makeCorridor({}).attributes, crossingDensityPerKm: 10 },
    });
    expect(scoreCharacter(high, "walking")).toBe(scoreCharacter(low, "walking"));
  });

  it("all type/activity combos produce valid 0-1 scores", () => {
    const types: CorridorType[] = [
      "trail",
      "path",
      "neighborhood",
      "rural-road",
      "collector",
      "arterial",
      "mixed",
    ];
    const activities: ActivityType[] = ["road-cycling", "gravel-cycling", "running", "walking"];
    for (const type of types) {
      for (const activity of activities) {
        const corridor = makeCorridor({ type });
        const score = scoreCharacter(corridor, activity);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ─── scoreScenic ────────────────────────────────────────────────────────────

describe("scoreScenic", () => {
  it("corridor with no scenic designation scores 0", () => {
    const corridor = makeCorridor({});
    expect(scoreScenic(corridor)).toBe(0);
  });

  it("corridor with full scenic designation scores 1", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        scenicScore: 1.0,
      },
    });
    expect(scoreScenic(corridor)).toBe(1.0);
  });

  it("corridor with partial scenic designation scores proportionally", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        scenicScore: 0.6,
      },
    });
    expect(scoreScenic(corridor)).toBeCloseTo(0.6);
  });
});

// ─── scoreCorridor ──────────────────────────────────────────────────────────

describe("scoreCorridor", () => {
  it("returns all sub-score fields", () => {
    const corridor = makeCorridor({});
    const result = scoreCorridor(corridor, "road-cycling");
    expect(result).toHaveProperty("overall");
    expect(result).toHaveProperty("flow");
    expect(result).toHaveProperty("safety");
    expect(result).toHaveProperty("surface");
    expect(result).toHaveProperty("character");
    expect(result).toHaveProperty("scenic");
  });

  it("overall equals flow when weights={flow:1, others:0}", () => {
    const corridor = makeCorridor({});
    const weights = { flow: 1, safety: 0, surface: 0, character: 0, scenic: 0, elevation: 0 };
    const result = scoreCorridor(corridor, "road-cycling", weights);
    expect(result.overall).toBeCloseTo(result.flow, 10);
  });

  it("overall equals safety when weights={safety:1, others:0}", () => {
    const corridor = makeCorridor({});
    const weights = { flow: 0, safety: 1, surface: 0, character: 0, scenic: 0, elevation: 0 };
    const result = scoreCorridor(corridor, "road-cycling", weights);
    expect(result.overall).toBeCloseTo(result.safety, 10);
  });

  it("trail with infra scores higher than arterial without for walking", () => {
    const trail = makeCorridor({
      type: "trail",
      attributes: {
        ...makeCorridor({}).attributes,
        lengthMeters: 5000,
        predominantRoadClass: "cycleway",
        predominantSurface: "paved",
        surfaceConfidence: 1.0,
        bicycleInfraContinuity: 1,
        pedestrianPathContinuity: 0,
        separationContinuity: 1,
        stopDensityPerKm: 0,
      },
    });
    const arterial = makeCorridor({
      type: "arterial",
      attributes: {
        ...makeCorridor({}).attributes,
        lengthMeters: 500,
        predominantRoadClass: "primary",
        predominantSurface: "paved",
        surfaceConfidence: 0.5,
        bicycleInfraContinuity: 0,
        pedestrianPathContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 6,
        averageSpeedLimit: 70,
      },
    });
    // For walking, trails are strongly preferred over arterials
    const trailScore = scoreCorridor(trail, "walking");
    const arterialScore = scoreCorridor(arterial, "walking");
    expect(trailScore.overall).toBeGreaterThan(arterialScore.overall);
  });
});

// ─── scoreCorridors ─────────────────────────────────────────────────────────

describe("scoreCorridors", () => {
  it("populates scores on all corridors", () => {
    const corridors = new Map<string, Corridor>();
    corridors.set("c1", makeCorridor({ id: "c1", type: "trail" }));
    corridors.set("c2", makeCorridor({ id: "c2", type: "arterial" }));
    corridors.set("c3", makeCorridor({ id: "c3", type: "neighborhood" }));

    scoreCorridors(corridors, "road-cycling");

    for (const corridor of corridors.values()) {
      expect(corridor.scores).toBeDefined();
      expect(corridor.scores!['road-cycling']).toBeDefined();
      expect(corridor.scores!['road-cycling']!.overall).toBeGreaterThanOrEqual(0);
      expect(corridor.scores!['road-cycling']!.overall).toBeLessThanOrEqual(1);
    }
  });

  it("can score for multiple activity types", () => {
    const corridors = new Map<string, Corridor>();
    corridors.set("c1", makeCorridor({ id: "c1" }));

    scoreCorridors(corridors, "road-cycling");
    scoreCorridors(corridors, "running");

    const c = corridors.get("c1")!;
    expect(c.scores!['road-cycling']).toBeDefined();
    expect(c.scores!.running).toBeDefined();
    expect(c.scores!['road-cycling']!.overall).not.toBe(c.scores!.running!.overall);
  });
});

// ─── DEFAULT_SCORING_WEIGHTS ────────────────────────────────────────────────

describe("DEFAULT_SCORING_WEIGHTS", () => {
  it("weights sum to 1.0 for each activity", () => {
    const activities: ActivityType[] = ["road-cycling", "gravel-cycling", "running", "walking"];
    for (const activity of activities) {
      const w = DEFAULT_SCORING_WEIGHTS[activity];
      const sum = w.flow + w.safety + w.surface + w.character + w.scenic + w.elevation;
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });
});
