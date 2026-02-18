import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_TILE_SIZE,
  tileForPoint,
  tileBbox,
  tileForBbox,
  tileCacheKey,
  readCachedResponse,
  writeCachedResponse,
  getCachePath,
} from "./cache.js";

const S = DEFAULT_TILE_SIZE;

describe("tileForPoint", () => {
  it("maps a point to the correct tile", () => {
    const tile = tileForPoint(42.923, -85.681);
    expect(tile.row).toBe(Math.floor(42.923 / S));
    expect(tile.col).toBe(Math.floor(-85.681 / S));
  });

  it("nearby points in the same tile get the same coordinates", () => {
    // Both within row=floor(42.92/S), col=floor(-85.68/S)
    const a = tileForPoint(42.92, -85.68);
    const b = tileForPoint(42.92 + S * 0.3, -85.68 + S * 0.3);
    expect(a).toEqual(b);
  });

  it("points in different tiles get different coordinates", () => {
    // Straddle a tile boundary
    const boundary = Math.ceil(42.9 / S) * S;
    const a = tileForPoint(boundary - 0.001, -85.68);
    const b = tileForPoint(boundary + 0.001, -85.68);
    expect(a.row).not.toBe(b.row);
  });

  it("respects custom tile size", () => {
    const tile = tileForPoint(42.923, -85.681, 0.1);
    expect(tile.row).toBe(Math.floor(42.923 / 0.1));
    expect(tile.col).toBe(Math.floor(-85.681 / 0.1));
  });
});

describe("tileBbox", () => {
  it("returns a bbox of exactly tileSize degrees", () => {
    const tile = tileForPoint(42.923, -85.681);
    const bbox = tileBbox(tile);
    expect(bbox.maxLat - bbox.minLat).toBeCloseTo(S);
    expect(bbox.maxLng - bbox.minLng).toBeCloseTo(S);
  });

  it("tile contains the point that generated it", () => {
    const lat = 42.923, lng = -85.681;
    const tile = tileForPoint(lat, lng);
    const bbox = tileBbox(tile);
    expect(bbox.minLat).toBeLessThanOrEqual(lat);
    expect(bbox.maxLat).toBeGreaterThan(lat);
    expect(bbox.minLng).toBeLessThanOrEqual(lng);
    expect(bbox.maxLng).toBeGreaterThan(lng);
  });
});

describe("tileForBbox", () => {
  it("uses the center of the bbox to pick the tile", () => {
    const bbox = { minLat: 42.91, maxLat: 42.94, minLng: -85.69, maxLng: -85.66 };
    const { tile } = tileForBbox(bbox);
    const expected = tileForPoint(42.925, -85.675);
    expect(tile).toEqual(expected);
  });

  it("returns a fixed-size tile bbox", () => {
    const bbox = { minLat: 42.91, maxLat: 42.94, minLng: -85.69, maxLng: -85.66 };
    const { bbox: tb } = tileForBbox(bbox);
    expect(tb.maxLat - tb.minLat).toBeCloseTo(S);
    expect(tb.maxLng - tb.minLng).toBeCloseTo(S);
  });
});

describe("tileCacheKey", () => {
  const tile = { row: 536, col: -1072 };

  it("returns a 16-character hex string", () => {
    expect(tileCacheKey(tile, 90)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    expect(tileCacheKey(tile, 90)).toBe(tileCacheKey(tile, 90));
  });

  it("differs with different tile coordinates", () => {
    const a = tileCacheKey(tile, 90);
    const b = tileCacheKey({ row: 537, col: -1072 }, 90);
    expect(a).not.toBe(b);
  });

  it("differs with different timeout", () => {
    expect(tileCacheKey(tile, 90)).not.toBe(tileCacheKey(tile, 120));
  });
});

describe("readCachedResponse / writeCachedResponse", () => {
  const tile = { row: 536, col: -1072 };
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "overpass-cache-test-"));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it("round-trips write → read", () => {
    const response = { elements: [{ type: "node", id: 1 }] } as any;
    writeCachedResponse(tile, 90, response, cacheDir);

    const cached = readCachedResponse(tile, 90, cacheDir);
    expect(cached).toEqual(response);
  });

  it("returns null on cache miss (no file)", () => {
    expect(readCachedResponse(tile, 90, cacheDir)).toBeNull();
  });

  it("returns null for empty file", () => {
    const key = tileCacheKey(tile, 90);
    writeFileSync(join(cacheDir, `${key}.json`), "");
    expect(readCachedResponse(tile, 90, cacheDir)).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    const key = tileCacheKey(tile, 90);
    writeFileSync(join(cacheDir, `${key}.json`), "{not valid json");
    expect(readCachedResponse(tile, 90, cacheDir)).toBeNull();
  });

  it("creates cache directory recursively", () => {
    const nested = join(cacheDir, "a", "b", "c");
    const response = { elements: [] } as any;
    writeCachedResponse(tile, 90, response, nested);
    expect(readCachedResponse(tile, 90, nested)).toEqual(response);
  });
});

describe("getCachePath", () => {
  const tile = { row: 536, col: -1072 };

  it("returns a path ending in .json", () => {
    expect(getCachePath(tile, 90, "/tmp/test")).toMatch(/\.json$/);
  });

  it("includes the cache key in the path", () => {
    const key = tileCacheKey(tile, 90);
    expect(getCachePath(tile, 90, "/tmp/test")).toContain(key);
  });
});
