import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildOverpassQuery, fetchOverpassData } from "./query.js";
import { tileForBbox, tileBbox, writeCachedResponse, readCachedResponse } from "./cache.js";
import { RELEVANT_HIGHWAYS } from "../osm/types.js";

vi.mock("overpass-ts", () => ({
  overpassJson: vi.fn(),
}));

import { overpassJson } from "overpass-ts";

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

describe("fetchOverpassData caching", () => {
  const bbox = { minLat: 42.91, maxLat: 42.94, minLng: -85.69, maxLng: -85.66 };
  const { tile } = tileForBbox(bbox);
  const mockResponse = { elements: [{ type: "node" as const, id: 1 }] };
  let cacheDir: string;
  const mockedOverpassJson = vi.mocked(overpassJson);

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "overpass-query-test-"));
    mockedOverpassJson.mockReset();
    mockedOverpassJson.mockResolvedValue(mockResponse as any);
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("returns cached response without calling API", async () => {
    writeCachedResponse(tile, 90, mockResponse as any, cacheDir);

    const result = await fetchOverpassData(bbox, { cacheDir });
    expect(result.data).toEqual(mockResponse);
    expect(mockedOverpassJson).not.toHaveBeenCalled();
  });

  it("returns the tile bbox as fetchedBbox", async () => {
    writeCachedResponse(tile, 90, mockResponse as any, cacheDir);

    const result = await fetchOverpassData(bbox, { cacheDir });
    expect(result.fetchedBbox).toEqual(tileBbox(tile));
  });

  it("calls API and writes cache on miss", async () => {
    const result = await fetchOverpassData(bbox, { cacheDir });
    expect(result.data).toEqual(mockResponse);
    expect(mockedOverpassJson).toHaveBeenCalledOnce();

    // Verify it was cached under the tile key
    const cached = readCachedResponse(tile, 90, cacheDir);
    expect(cached).toEqual(mockResponse);
  });

  it("force: true skips cache read but still writes", async () => {
    writeCachedResponse(tile, 90, { elements: [] } as any, cacheDir);

    const result = await fetchOverpassData(bbox, { cacheDir, force: true });
    expect(result.data).toEqual(mockResponse);
    expect(mockedOverpassJson).toHaveBeenCalledOnce();

    const cached = readCachedResponse(tile, 90, cacheDir);
    expect(cached).toEqual(mockResponse);
  });

  it("noCache: true disables both read and write", async () => {
    const result = await fetchOverpassData(bbox, { cacheDir, noCache: true });
    expect(result.data).toEqual(mockResponse);
    expect(mockedOverpassJson).toHaveBeenCalledOnce();

    expect(readCachedResponse(tile, 90, cacheDir)).toBeNull();
  });

  it("nearby bboxes with same center tile share the cache", async () => {
    // Two bboxes at different zoom levels but same center tile
    const zoomed = { minLat: 42.92, maxLat: 42.93, minLng: -85.68, maxLng: -85.67 };
    const wide = { minLat: 42.90, maxLat: 42.95, minLng: -85.70, maxLng: -85.65 };
    // Both centers fall in the same tile
    expect(tileForBbox(zoomed).tile).toEqual(tileForBbox(wide).tile);

    await fetchOverpassData(zoomed, { cacheDir });
    expect(mockedOverpassJson).toHaveBeenCalledOnce();

    // Second call at different zoom — cache hit
    const result = await fetchOverpassData(wide, { cacheDir });
    expect(result.data).toEqual(mockResponse);
    expect(mockedOverpassJson).toHaveBeenCalledOnce();
  });
});
