import { describe, it, expect } from "vitest";
import {
  scoreFlow,
  scoreSafety,
  scoreSurface,
  scoreCharacter,
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
      predominantSurface: "asphalt",
      surfaceConfidence: 0.8,
      infrastructureContinuity: 0,
      separationContinuity: 0,
      stopDensityPerKm: 0,
      turnsCount: 0,
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
  it("cycleway with full infra/separation scores >0.8", () => {
    const safe = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantRoadClass: "cycleway",
        infrastructureContinuity: 1,
        separationContinuity: 1,
        averageSpeedLimit: 30,
      },
    });
    expect(scoreSafety(safe)).toBeGreaterThan(0.8);
  });

  it("primary road with no infra and speed 70 scores <0.2", () => {
    const unsafe = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantRoadClass: "primary",
        infrastructureContinuity: 0,
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
        infrastructureContinuity: 0.5,
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
  it("asphalt scores >0.9 for cycling with confidence 1.0", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "asphalt",
        surfaceConfidence: 1.0,
      },
    });
    expect(scoreSurface(corridor, "road-cycling")).toBeGreaterThan(0.9);
  });

  it("gravel scores <0.4 for cycling", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "gravel",
        surfaceConfidence: 1.0,
      },
    });
    // Road cycling must avoid gravel — score should be 0
    expect(scoreSurface(corridor, "road-cycling")).toBe(0.0);
  });

  it("dirt scores high for running", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "dirt",
        surfaceConfidence: 1.0,
      },
    });
    expect(scoreSurface(corridor, "running")).toBeGreaterThan(0.7);
  });

  it("gravel scores high for running", () => {
    const corridor = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "gravel",
        surfaceConfidence: 1.0,
      },
    });
    expect(scoreSurface(corridor, "running")).toBeGreaterThan(0.7);
  });

  it("low confidence penalizes score", () => {
    const highConf = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "asphalt",
        surfaceConfidence: 1.0,
      },
    });
    const lowConf = makeCorridor({
      attributes: {
        ...makeCorridor({}).attributes,
        predominantSurface: "asphalt",
        surfaceConfidence: 0.2,
      },
    });
    expect(scoreSurface(lowConf, "road-cycling")).toBeLessThan(
      scoreSurface(highConf, "road-cycling"),
    );
  });

  it("walking is permissive (all surfaces >0.5)", () => {
    const surfaces = [
      "asphalt",
      "concrete",
      "paved",
      "gravel",
      "dirt",
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
  it("quiet-road scores 1.0 for road cycling", () => {
    const corridor = makeCorridor({ type: "quiet-road" });
    expect(scoreCharacter(corridor, "road-cycling")).toBe(1.0);
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

  it("all type/activity combos produce valid 0-1 scores", () => {
    const types: CorridorType[] = [
      "trail",
      "path",
      "quiet-road",
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
  });

  it("overall equals flow when weights={flow:1, others:0}", () => {
    const corridor = makeCorridor({});
    const weights = { flow: 1, safety: 0, surface: 0, character: 0 };
    const result = scoreCorridor(corridor, "road-cycling", weights);
    expect(result.overall).toBeCloseTo(result.flow, 10);
  });

  it("overall equals safety when weights={safety:1, others:0}", () => {
    const corridor = makeCorridor({});
    const weights = { flow: 0, safety: 1, surface: 0, character: 0 };
    const result = scoreCorridor(corridor, "road-cycling", weights);
    expect(result.overall).toBeCloseTo(result.safety, 10);
  });

  it("trail with infra scores much higher than arterial without", () => {
    const trail = makeCorridor({
      type: "trail",
      attributes: {
        ...makeCorridor({}).attributes,
        lengthMeters: 5000,
        predominantRoadClass: "cycleway",
        predominantSurface: "asphalt",
        surfaceConfidence: 1.0,
        infrastructureContinuity: 1,
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
        predominantSurface: "asphalt",
        surfaceConfidence: 0.5,
        infrastructureContinuity: 0,
        separationContinuity: 0,
        stopDensityPerKm: 6,
        averageSpeedLimit: 70,
      },
    });
    const trailScore = scoreCorridor(trail, "road-cycling");
    const arterialScore = scoreCorridor(arterial, "road-cycling");
    expect(trailScore.overall).toBeGreaterThan(arterialScore.overall + 0.3);
  });
});

// ─── scoreCorridors ─────────────────────────────────────────────────────────

describe("scoreCorridors", () => {
  it("populates scores on all corridors", () => {
    const corridors = new Map<string, Corridor>();
    corridors.set("c1", makeCorridor({ id: "c1", type: "trail" }));
    corridors.set("c2", makeCorridor({ id: "c2", type: "arterial" }));
    corridors.set("c3", makeCorridor({ id: "c3", type: "quiet-road" }));

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
      const sum = w.flow + w.safety + w.surface + w.character;
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });
});
