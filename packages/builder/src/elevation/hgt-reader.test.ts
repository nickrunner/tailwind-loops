import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemReader } from "./hgt-reader.js";

// Real SRTM1 tile covering N42-N43, W86-W85 (Grand Rapids area)
const TILES_DIR = join(__dirname, "../../../../data/elevation");

// ─── tileFilename (unit, no I/O) ────────────────────────────────────────────

describe("tileFilename", () => {
  it("N42 W86 → N42W086.hgt", () => {
    expect(DemReader.tileFilename(42, -86)).toBe("N42W086.hgt");
  });

  it("S01 E010 → S01E010.hgt", () => {
    expect(DemReader.tileFilename(-1, 10)).toBe("S01E010.hgt");
  });

  it("fractional coords: (42.5, -85.3) → N42W086.hgt", () => {
    expect(DemReader.tileFilename(42.5, -85.3)).toBe("N42W086.hgt");
  });

  it("negative fractional lat: (-0.5, 10.2) → S01E010.hgt", () => {
    expect(DemReader.tileFilename(-0.5, 10.2)).toBe("S01E010.hgt");
  });

  it("zero lat/lng → N00E000.hgt", () => {
    expect(DemReader.tileFilename(0, 0)).toBe("N00E000.hgt");
  });

  it("pads single-digit latitude", () => {
    expect(DemReader.tileFilename(5, 100)).toBe("N05E100.hgt");
  });

  it("pads longitude to 3 digits", () => {
    expect(DemReader.tileFilename(47.6, -122.3)).toBe("N47W123.hgt");
  });
});

// ─── getElevation (real file) ────────────────────────────────────────────────

describe("getElevation", () => {
  const dem = new DemReader({ tilesDir: TILES_DIR });

  it("returns a reasonable elevation for downtown Grand Rapids (~42.963, -85.668)", () => {
    const elev = dem.getElevation(42.963, -85.668);
    expect(elev).not.toBeNull();
    // Grand River valley floor is roughly 180-200m
    expect(elev!).toBeGreaterThanOrEqual(150);
    expect(elev!).toBeLessThanOrEqual(230);
  });

  it("returns a reasonable elevation for a known area (~42.95, -85.65)", () => {
    const elev = dem.getElevation(42.95, -85.65);
    expect(elev).not.toBeNull();
    // Grand Rapids area is generally 180-260m
    expect(elev!).toBeGreaterThanOrEqual(150);
    expect(elev!).toBeLessThanOrEqual(300);
  });

  it("two nearby points (< 100m apart) differ by < 20m", () => {
    // Two points ~50m apart in a flat area
    const e1 = dem.getElevation(42.963, -85.668);
    const e2 = dem.getElevation(42.9634, -85.668);
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    expect(Math.abs(e1! - e2!)).toBeLessThan(20);
  });

  it("returns null for coordinate outside tile coverage (lat=50)", () => {
    const elev = dem.getElevation(50, -85.5);
    expect(elev).toBeNull();
  });

  it("returns null for coordinate outside tile coverage (lng=-80)", () => {
    const elev = dem.getElevation(42.5, -80);
    expect(elev).toBeNull();
  });

  it("does not crash on tile boundary (exact integer lat/lng 42.0, -86.0)", () => {
    const elev = dem.getElevation(42.0, -86.0);
    // Should either return a valid elevation or null, but not throw
    if (elev != null) {
      expect(elev).toBeGreaterThanOrEqual(100);
      expect(elev).toBeLessThanOrEqual(400);
    }
  });

  it("does not crash on near-boundary coordinates", () => {
    // Just inside the tile at the south-west corner
    const elev = dem.getElevation(42.001, -85.999);
    if (elev != null) {
      expect(elev).toBeGreaterThanOrEqual(100);
      expect(elev).toBeLessThanOrEqual(400);
    }
  });

  it("does not crash on near-boundary coordinates at the north-east corner", () => {
    const elev = dem.getElevation(42.999, -85.001);
    if (elev != null) {
      expect(elev).toBeGreaterThanOrEqual(100);
      expect(elev).toBeLessThanOrEqual(400);
    }
  });
});

// ─── getElevations (batch) ───────────────────────────────────────────────────

describe("getElevations", () => {
  const dem = new DemReader({ tilesDir: TILES_DIR });

  it("returns same results as individual getElevation calls", () => {
    const coords = [
      { lat: 42.963, lng: -85.668 },
      { lat: 42.95, lng: -85.65 },
      { lat: 42.97, lng: -85.67 },
    ];

    const batch = dem.getElevations(coords);
    const individual = coords.map((c) => dem.getElevation(c.lat, c.lng));

    expect(batch).toEqual(individual);
  });

  it("array length matches input length", () => {
    const coords = [
      { lat: 42.963, lng: -85.668 },
      { lat: 50.0, lng: -85.5 }, // outside coverage
      { lat: 42.95, lng: -85.65 },
    ];

    const results = dem.getElevations(coords);
    expect(results).toHaveLength(coords.length);
  });

  it("returns null for out-of-range coords within the batch", () => {
    const coords = [
      { lat: 42.963, lng: -85.668 },
      { lat: 50.0, lng: -85.5 }, // no tile
    ];

    const results = dem.getElevations(coords);
    expect(results[0]).not.toBeNull();
    expect(results[1]).toBeNull();
  });

  it("handles empty input", () => {
    const results = dem.getElevations([]);
    expect(results).toEqual([]);
  });
});
