import { describe, it, expect } from "vitest";
import type { Observation } from "@tailwind-loops/types";
import {
  SurfaceFusionStrategy,
  SpeedLimitFusionStrategy,
  PointDetectionFusionStrategy,
  BooleanFusionStrategy,
  NumericFusionStrategy,
  createDefaultStrategies,
} from "./fusion.js";

// ─── SurfaceFusionStrategy ──────────────────────────────────────────────────

describe("SurfaceFusionStrategy", () => {
  const strategy = new SurfaceFusionStrategy();

  it("returns unknown with 0 confidence for empty observations", () => {
    const result = strategy.fuse([]);
    expect(result.value).toBe("unknown");
    expect(result.confidence).toBe(0);
    expect(result.hasConflict).toBe(false);
  });

  it("resolves single paved observation", () => {
    const obs: Observation<"surface">[] = [
      { attribute: "surface", source: "osm-tag", value: "paved", sourceConfidence: 0.8 },
    ];
    const result = strategy.fuse(obs);
    expect(result.value).toBe("paved");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("prefers higher-weight source when sources disagree", () => {
    const obs: Observation<"surface">[] = [
      { attribute: "surface", source: "gravelmap", value: "unpaved", sourceConfidence: 0.9 },
      { attribute: "surface", source: "osm-inferred", value: "paved", sourceConfidence: 0.8 },
    ];
    const result = strategy.fuse(obs);
    expect(result.value).toBe("unpaved");
    expect(result.hasConflict).toBe(true);
  });

  it("increases confidence with multiple agreeing sources", () => {
    const single: Observation<"surface">[] = [
      { attribute: "surface", source: "osm-tag", value: "paved", sourceConfidence: 0.7 },
    ];
    const multi: Observation<"surface">[] = [
      { attribute: "surface", source: "osm-tag", value: "paved", sourceConfidence: 0.7 },
      { attribute: "surface", source: "gravelmap", value: "paved", sourceConfidence: 0.9 },
    ];
    expect(strategy.fuse(multi).confidence).toBeGreaterThan(
      strategy.fuse(single).confidence
    );
  });
});

// ─── SpeedLimitFusionStrategy ───────────────────────────────────────────────

describe("SpeedLimitFusionStrategy", () => {
  const strategy = new SpeedLimitFusionStrategy();

  it("returns 0 with 0 confidence for empty observations", () => {
    const result = strategy.fuse([]);
    expect(result.value).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("resolves single speed limit observation", () => {
    const obs: Observation<"speed-limit">[] = [
      { attribute: "speed-limit", source: "osm-tag", value: 50, sourceConfidence: 0.8 },
    ];
    const result = strategy.fuse(obs);
    expect(result.value).toBe(50);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.hasConflict).toBe(false);
  });

  it("computes weighted median when multiple sources agree", () => {
    const obs: Observation<"speed-limit">[] = [
      { attribute: "speed-limit", source: "osm-tag", value: 50, sourceConfidence: 0.8 },
      { attribute: "speed-limit", source: "municipal-open-data", value: 50, sourceConfidence: 0.9 },
    ];
    const result = strategy.fuse(obs);
    expect(result.value).toBe(50);
    expect(result.hasConflict).toBe(false);
  });

  it("flags conflict when spread > 20 km/h", () => {
    const obs: Observation<"speed-limit">[] = [
      { attribute: "speed-limit", source: "osm-tag", value: 30, sourceConfidence: 0.8 },
      { attribute: "speed-limit", source: "municipal-open-data", value: 60, sourceConfidence: 0.9 },
    ];
    const result = strategy.fuse(obs);
    expect(result.hasConflict).toBe(true);
  });

  it("does not flag conflict when spread <= 20 km/h", () => {
    const obs: Observation<"speed-limit">[] = [
      { attribute: "speed-limit", source: "osm-tag", value: 40, sourceConfidence: 0.8 },
      { attribute: "speed-limit", source: "municipal-open-data", value: 50, sourceConfidence: 0.9 },
    ];
    const result = strategy.fuse(obs);
    expect(result.hasConflict).toBe(false);
  });
});

// ─── PointDetectionFusionStrategy ───────────────────────────────────────────

describe("PointDetectionFusionStrategy", () => {
  const strategy = new PointDetectionFusionStrategy("stop-sign");

  it("returns zero confidence for empty observations", () => {
    const result = strategy.fuse([]);
    expect(result.confidence).toBe(0);
  });

  it("resolves single detection", () => {
    const obs: Observation<"stop-sign">[] = [
      {
        attribute: "stop-sign",
        source: "osm-tag",
        value: { coordinate: { lat: 42.96, lng: -85.67 }, detectionConfidence: 0.9 },
        sourceConfidence: 0.8,
      },
    ];
    const result = strategy.fuse(obs);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.value.coordinate.lat).toBeCloseTo(42.96);
  });

  it("deduplicates nearby detections (within 15m)", () => {
    const obs: Observation<"stop-sign">[] = [
      {
        attribute: "stop-sign",
        source: "osm-tag",
        value: { coordinate: { lat: 42.96, lng: -85.67 }, detectionConfidence: 0.8 },
        sourceConfidence: 0.8,
      },
      {
        attribute: "stop-sign",
        source: "mapillary",
        // ~5m away
        value: { coordinate: { lat: 42.96002, lng: -85.67 }, detectionConfidence: 0.7 },
        sourceConfidence: 0.7,
      },
    ];
    const result = strategy.fuse(obs);
    // Multi-source should increase confidence
    expect(result.confidence).toBeGreaterThan(0.4);
    // Average coordinate
    expect(result.value.coordinate.lat).toBeCloseTo(42.96001, 4);
  });
});

// ─── BooleanFusionStrategy ──────────────────────────────────────────────────

describe("BooleanFusionStrategy", () => {
  const strategy = new BooleanFusionStrategy("bicycle-infra");

  it("returns false with 0 confidence for empty observations", () => {
    const result = strategy.fuse([]);
    expect(result.value).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it("resolves to true when majority says true", () => {
    const obs: Observation<"bicycle-infra">[] = [
      { attribute: "bicycle-infra", source: "osm-tag", value: true, sourceConfidence: 0.8 },
      { attribute: "bicycle-infra", source: "municipal-open-data", value: true, sourceConfidence: 0.9 },
      { attribute: "bicycle-infra", source: "mapillary", value: false, sourceConfidence: 0.5 },
    ];
    const result = strategy.fuse(obs);
    expect(result.value).toBe(true);
  });

  it("flags conflict when vote is close", () => {
    const obs: Observation<"bicycle-infra">[] = [
      { attribute: "bicycle-infra", source: "osm-tag", value: true, sourceConfidence: 0.8 },
      { attribute: "bicycle-infra", source: "mapillary", value: false, sourceConfidence: 0.8 },
    ];
    const result = strategy.fuse(obs);
    // When it's 50/50, the agreement ratio should be ~0.5 which is < 0.7
    expect(result.hasConflict).toBe(true);
  });
});

// ─── NumericFusionStrategy ──────────────────────────────────────────────────

describe("NumericFusionStrategy", () => {
  const strategy = new NumericFusionStrategy();

  it("returns 0 with 0 confidence for empty observations", () => {
    const result = strategy.fuse([]);
    expect(result.value).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("computes weighted average of scenic scores", () => {
    const obs: Observation<"scenic">[] = [
      { attribute: "scenic", source: "osm-tag", value: 0.8, sourceConfidence: 0.9 },
      { attribute: "scenic", source: "user-report", value: 0.6, sourceConfidence: 0.8 },
    ];
    const result = strategy.fuse(obs);
    expect(result.value).toBeGreaterThan(0.5);
    expect(result.value).toBeLessThan(1);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("flags high-variance observations as conflict", () => {
    const obs: Observation<"scenic">[] = [
      { attribute: "scenic", source: "osm-tag", value: 0.1, sourceConfidence: 0.9 },
      { attribute: "scenic", source: "user-report", value: 0.9, sourceConfidence: 0.8 },
    ];
    const result = strategy.fuse(obs);
    expect(result.hasConflict).toBe(true);
  });
});

// ─── createDefaultStrategies ────────────────────────────────────────────────

describe("createDefaultStrategies", () => {
  it("creates strategies for all enrichable attributes", () => {
    const strategies = createDefaultStrategies();
    expect(strategies.has("surface")).toBe(true);
    expect(strategies.has("speed-limit")).toBe(true);
    expect(strategies.has("stop-sign")).toBe(true);
    expect(strategies.has("traffic-signal")).toBe(true);
    expect(strategies.has("road-crossing")).toBe(true);
    expect(strategies.has("bicycle-infra")).toBe(true);
    expect(strategies.has("traffic-calming")).toBe(true);
    expect(strategies.has("scenic")).toBe(true);
    expect(strategies.size).toBe(8);
  });
});
