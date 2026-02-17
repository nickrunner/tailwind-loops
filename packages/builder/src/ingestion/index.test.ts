import { describe, it, expect } from "vitest";
import { fuseSurfaceObservations } from "./index.js";
import type { SurfaceObservation } from "@tailwind-loops/types";

describe("fuseSurfaceObservations", () => {
  it("returns unknown with zero confidence for empty observations", () => {
    const result = fuseSurfaceObservations([]);
    expect(result.surface).toBe("unknown");
    expect(result.confidence).toBe(0);
    expect(result.observations).toEqual([]);
    expect(result.hasConflict).toBe(false);
  });

  it("returns the surface from a single observation", () => {
    const obs: SurfaceObservation = {
      source: "osm-surface-tag",
      surface: "gravel",
      sourceConfidence: 0.8,
    };
    const result = fuseSurfaceObservations([obs]);

    expect(result.surface).toBe("gravel");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.observations).toEqual([obs]);
    expect(result.hasConflict).toBe(false);
  });

  it("weights gravelmap higher than OSM inference", () => {
    const osmObs: SurfaceObservation = {
      source: "osm-highway-inferred",
      surface: "paved",
      sourceConfidence: 1.0,
    };
    const gravelmapObs: SurfaceObservation = {
      source: "gravelmap",
      surface: "gravel",
      sourceConfidence: 0.8,
    };

    const result = fuseSurfaceObservations([osmObs, gravelmapObs]);

    // Gravelmap should win due to higher source weight (0.9 vs 0.2)
    expect(result.surface).toBe("gravel");
  });

  it("weights OSM surface tag higher than highway inference", () => {
    const osmTagObs: SurfaceObservation = {
      source: "osm-surface-tag",
      surface: "gravel",
      sourceConfidence: 0.8,
    };
    const osmInferredObs: SurfaceObservation = {
      source: "osm-highway-inferred",
      surface: "paved",
      sourceConfidence: 1.0,
    };

    const result = fuseSurfaceObservations([osmTagObs, osmInferredObs]);

    // OSM surface tag should win (0.7 * 0.8 = 0.56 vs 0.2 * 1.0 = 0.2)
    expect(result.surface).toBe("gravel");
  });

  it("flags conflicts when sources disagree significantly", () => {
    const obs1: SurfaceObservation = {
      source: "osm-surface-tag",
      surface: "paved",
      sourceConfidence: 0.9,
    };
    const obs2: SurfaceObservation = {
      source: "gravelmap",
      surface: "gravel",
      sourceConfidence: 0.9,
    };

    const result = fuseSurfaceObservations([obs1, obs2]);

    expect(result.hasConflict).toBe(true);
  });

  it("does not flag conflict when one source dominates", () => {
    const strongObs: SurfaceObservation = {
      source: "gravelmap",
      surface: "gravel",
      sourceConfidence: 1.0,
    };
    const weakObs: SurfaceObservation = {
      source: "osm-highway-inferred",
      surface: "paved",
      sourceConfidence: 0.3,
    };

    const result = fuseSurfaceObservations([strongObs, weakObs]);

    // Gravelmap: 0.9 * 1.0 = 0.9
    // OSM inferred: 0.2 * 0.3 = 0.06
    // 0.06 < 0.9 * 0.5 = 0.45, so no conflict
    expect(result.hasConflict).toBe(false);
  });

  it("increases confidence with multiple agreeing sources", () => {
    const singleObs: SurfaceObservation = {
      source: "osm-surface-tag",
      surface: "gravel",
      sourceConfidence: 0.8,
    };

    const resultSingle = fuseSurfaceObservations([singleObs]);

    const multipleObs: SurfaceObservation[] = [
      { source: "osm-surface-tag", surface: "gravel", sourceConfidence: 0.8 },
      { source: "gravelmap", surface: "gravel", sourceConfidence: 0.8 },
      { source: "user-report", surface: "gravel", sourceConfidence: 0.9 },
    ];

    const resultMultiple = fuseSurfaceObservations(multipleObs);

    // Multiple agreeing sources should have higher confidence
    expect(resultMultiple.confidence).toBeGreaterThan(resultSingle.confidence);
    expect(resultMultiple.hasConflict).toBe(false);
  });

  it("preserves all observations in the result", () => {
    const observations: SurfaceObservation[] = [
      { source: "osm-surface-tag", surface: "gravel", sourceConfidence: 0.8 },
      { source: "gravelmap", surface: "gravel", sourceConfidence: 0.7 },
    ];

    const result = fuseSurfaceObservations(observations);

    expect(result.observations).toEqual(observations);
    expect(result.observations.length).toBe(2);
  });

  it("caps confidence at 0.95", () => {
    // Create many agreeing high-confidence sources
    const observations: SurfaceObservation[] = [
      { source: "gravelmap", surface: "gravel", sourceConfidence: 1.0 },
      { source: "user-report", surface: "gravel", sourceConfidence: 1.0 },
      { source: "osm-surface-tag", surface: "gravel", sourceConfidence: 1.0 },
      { source: "strava-heatmap", surface: "gravel", sourceConfidence: 1.0 },
    ];

    const result = fuseSurfaceObservations(observations);

    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it("handles user-report as high-priority source", () => {
    const userReport: SurfaceObservation = {
      source: "user-report",
      surface: "dirt",
      sourceConfidence: 0.9,
    };
    const osmInferred: SurfaceObservation = {
      source: "osm-highway-inferred",
      surface: "paved",
      sourceConfidence: 1.0,
    };

    const result = fuseSurfaceObservations([userReport, osmInferred]);

    // User report: 0.85 * 0.9 = 0.765
    // OSM inferred: 0.2 * 1.0 = 0.2
    expect(result.surface).toBe("dirt");
  });
});
