import { describe, it, expect } from "vitest";
import { buildOverpassQuery } from "./query.js";
import { RELEVANT_HIGHWAYS } from "../osm/types.js";

describe("buildOverpassQuery", () => {
  const bbox = { minLat: 42.9, maxLat: 43.0, minLng: -85.7, maxLng: -85.6 };

  it("includes all relevant highway types in regex", () => {
    const query = buildOverpassQuery(bbox);

    for (const highway of RELEVANT_HIGHWAYS) {
      expect(query).toContain(highway);
    }
  });

  it("formats bbox as south,west,north,east", () => {
    const query = buildOverpassQuery(bbox);

    // Overpass expects (south,west,north,east) = (minLat,minLng,maxLat,maxLng)
    expect(query).toContain("42.9,-85.7,43,-85.6");
  });

  it("requests JSON output", () => {
    const query = buildOverpassQuery(bbox);
    expect(query).toContain("[out:json]");
  });

  it("uses out body geom for inline geometry", () => {
    const query = buildOverpassQuery(bbox);
    expect(query).toContain("out body geom;");
  });

  it("includes traffic signal and stop node queries", () => {
    const query = buildOverpassQuery(bbox);
    expect(query).toContain("traffic_signals");
    expect(query).toContain("stop");
    expect(query).toContain("crossing");
  });

  it("respects custom timeout", () => {
    const query = buildOverpassQuery(bbox, 120);
    expect(query).toContain("[timeout:120]");
  });

  it("uses default timeout of 90", () => {
    const query = buildOverpassQuery(bbox);
    expect(query).toContain("[timeout:90]");
  });
});
