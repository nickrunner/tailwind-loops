import { describe, it, expect } from "vitest";
import { edgeCompatibility } from "./edge-compatibility.js";
import type { EdgeAttributes } from "@tailwind-loops/types";

/** Helper to create EdgeAttributes with sensible defaults */
function makeEdge(overrides: Partial<EdgeAttributes> = {}): EdgeAttributes {
  return {
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
    lengthMeters: 100,
    ...overrides,
  };
}

describe("edgeCompatibility", () => {
  it("returns 1 for identical attributes", () => {
    const a = makeEdge({ name: "Main St" });
    const b = makeEdge({ name: "Main St" });
    expect(edgeCompatibility(a, b)).toBeCloseTo(1);
  });

  it("returns 1 for identical attributes without names", () => {
    const a = makeEdge();
    const b = makeEdge();
    expect(edgeCompatibility(a, b)).toBeCloseTo(1);
  });

  it("returns 0 for completely different edges", () => {
    const a = makeEdge({
      roadClass: "cycleway",
      surfaceClassification: {
        surface: "paved",
        confidence: 0.9,
        observations: [],
        hasConflict: false,
      },
      infrastructure: {
        hasBicycleInfra: true,
        hasPedestrianPath: false,
        hasShoulder: false,
        isSeparated: true,
        hasTrafficCalming: false,
      },
      name: "Bike Trail",
    });
    const b = makeEdge({
      roadClass: "primary",
      surfaceClassification: {
        surface: "unpaved",
        confidence: 0.5,
        observations: [],
        hasConflict: false,
      },
      infrastructure: {
        hasBicycleInfra: false,
        hasPedestrianPath: false,
        hasShoulder: true,
        isSeparated: false,
        hasTrafficCalming: false,
      },
      name: "Highway 1",
    });
    expect(edgeCompatibility(a, b)).toBe(0);
  });

  describe("road class scoring", () => {
    it("scores 0 for road class group change (residential → cycleway)", () => {
      const a = makeEdge({ roadClass: "residential" });
      const b = makeEdge({ roadClass: "cycleway" });
      expect(edgeCompatibility(a, b)).toBe(0);
    });

    it("scores 0 for road class group change (path → primary)", () => {
      const a = makeEdge({ roadClass: "path" });
      const b = makeEdge({ roadClass: "primary" });
      expect(edgeCompatibility(a, b)).toBe(0);
    });

    it("gives partial credit for same-group different class (residential → service)", () => {
      const a = makeEdge({ roadClass: "residential" });
      const b = makeEdge({ roadClass: "service" });
      const score = edgeCompatibility(a, b);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it("gives full credit for path → footway (same group, same rank)", () => {
      const a = makeEdge({ roadClass: "path" });
      const b = makeEdge({ roadClass: "footway" });
      const score = edgeCompatibility(a, b);
      expect(score).toBeCloseTo(1);
    });
  });

  describe("surface scoring", () => {
    it("penalizes paved vs gravel difference", () => {
      const a = makeEdge();
      const b = makeEdge({
        surfaceClassification: {
          surface: "unpaved",
          confidence: 0.8,
          observations: [],
          hasConflict: false,
        },
      });
      const sameScore = edgeCompatibility(makeEdge(), makeEdge());
      const diffScore = edgeCompatibility(a, b);
      expect(diffScore).toBeLessThan(sameScore);
    });

    it("gives partial credit for unknown surface", () => {
      const a = makeEdge();
      const b = makeEdge({
        surfaceClassification: {
          surface: "unknown",
          confidence: 0.1,
          observations: [],
          hasConflict: false,
        },
      });
      const score = edgeCompatibility(a, b);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it("treats asphalt and concrete as same group", () => {
      const a = makeEdge({
        surfaceClassification: {
          surface: "paved",
          confidence: 0.8,
          observations: [],
          hasConflict: false,
        },
      });
      const b = makeEdge({
        surfaceClassification: {
          surface: "paved",
          confidence: 0.8,
          observations: [],
          hasConflict: false,
        },
      });
      const score = edgeCompatibility(a, b);
      // Same group should score higher than different groups
      expect(score).toBeGreaterThan(0.8);
    });
  });

  describe("speed limit", () => {
    it("returns 0 when speed difference exceeds threshold", () => {
      const a = makeEdge({ speedLimit: 30 });
      const b = makeEdge({ speedLimit: 60 });
      // Default maxSpeedDifference is 15
      expect(edgeCompatibility(a, b)).toBe(0);
    });

    it("allows edges within speed threshold", () => {
      const a = makeEdge({ speedLimit: 30 });
      const b = makeEdge({ speedLimit: 40 });
      expect(edgeCompatibility(a, b)).toBeGreaterThan(0);
    });

    it("ignores speed limit when one or both are undefined", () => {
      const a = makeEdge({ speedLimit: 50 });
      const b = makeEdge(); // no speedLimit
      expect(edgeCompatibility(a, b)).toBeGreaterThan(0);
    });

    it("respects custom maxSpeedDifference option", () => {
      const a = makeEdge({ speedLimit: 30 });
      const b = makeEdge({ speedLimit: 60 });
      // With higher threshold, should not return 0
      const score = edgeCompatibility(a, b, { maxSpeedDifference: 50 });
      expect(score).toBeGreaterThan(0);
    });
  });

  describe("name scoring", () => {
    it("penalizes name change when allowNameChanges is false", () => {
      const a = makeEdge({ name: "Main St" });
      const b = makeEdge({ name: "Oak Ave" });
      const score = edgeCompatibility(a, b, { allowNameChanges: false });
      const sameNameScore = edgeCompatibility(
        makeEdge({ name: "Main St" }),
        makeEdge({ name: "Main St" }),
        { allowNameChanges: false }
      );
      expect(score).toBeLessThan(sameNameScore);
    });

    it("gives partial credit for name change when allowNameChanges is true", () => {
      const a = makeEdge({ name: "Main St" });
      const b = makeEdge({ name: "Oak Ave" });
      const score = edgeCompatibility(a, b, { allowNameChanges: true });
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it("treats both unnamed as matching", () => {
      const a = makeEdge();
      const b = makeEdge();
      expect(edgeCompatibility(a, b)).toBeCloseTo(1);
    });
  });

  describe("infrastructure scoring", () => {
    it("penalizes different infrastructure", () => {
      const a = makeEdge({
        infrastructure: {
          hasBicycleInfra: true,
          hasPedestrianPath: false,
          hasShoulder: false,
          isSeparated: true,
          hasTrafficCalming: false,
        },
      });
      const b = makeEdge({
        infrastructure: {
          hasBicycleInfra: false,
          hasPedestrianPath: false,
          hasShoulder: false,
          isSeparated: false,
          hasTrafficCalming: false,
        },
      });
      const allSame = edgeCompatibility(makeEdge(), makeEdge());
      const diffInfra = edgeCompatibility(a, b);
      expect(diffInfra).toBeLessThan(allSame);
    });
  });

  describe("combined scoring", () => {
    it("subtle differences produce intermediate score", () => {
      const a = makeEdge({
        name: "Elm St",
        speedLimit: 25,
      });
      const b = makeEdge({
        name: "Elm St Extension",
        speedLimit: 30,
      });
      const score = edgeCompatibility(a, b);
      // Same road class, same surface, same infra, different name
      // Should be high but not perfect
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThan(1);
    });

    it("score is always between 0 and 1", () => {
      const edges = [
        makeEdge({ roadClass: "residential", name: "A" }),
        makeEdge({ roadClass: "service", name: "B" }),
        makeEdge({ roadClass: "residential", speedLimit: 40 }),
        makeEdge({ roadClass: "residential", speedLimit: 25 }),
      ];

      for (const a of edges) {
        for (const b of edges) {
          const score = edgeCompatibility(a, b);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
