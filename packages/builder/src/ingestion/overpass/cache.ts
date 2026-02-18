/**
 * Disk cache for Overpass API responses.
 *
 * Divides the world into fixed-size tiles on a regular grid. Each tile
 * is fetched and cached independently, keyed by its grid coordinates.
 * As the user pans around, new tiles are fetched and the tuner's
 * in-memory coverage tracking accumulates them.
 *
 * Cache lives at ~/.tailwind-loops/overpass-cache/.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BoundingBox } from "@tailwind-loops/types";
import type { OverpassJson } from "overpass-ts";

/** Default tile size: 0.3° ≈ 33km (20mi) N-S per tile at mid-latitudes */
export const DEFAULT_TILE_SIZE = 0.3;

/** Grid coordinates identifying a tile */
export interface TileCoord {
  row: number;
  col: number;
}

/** Default cache directory */
export function defaultCacheDir(): string {
  return join(homedir(), ".tailwind-loops", "overpass-cache");
}

/**
 * Get the tile that contains a given point.
 */
export function tileForPoint(
  lat: number,
  lng: number,
  tileSize: number = DEFAULT_TILE_SIZE
): TileCoord {
  return {
    row: Math.floor(lat / tileSize),
    col: Math.floor(lng / tileSize),
  };
}

/**
 * Get the fixed bounding box for a tile.
 *
 * Uses rounding to clean up floating-point artifacts
 * (e.g. 858 * 0.05 = 42.900000000000006).
 */
export function tileBbox(
  tile: TileCoord,
  tileSize: number = DEFAULT_TILE_SIZE
): BoundingBox {
  const round = (v: number) => Math.round(v * 1e8) / 1e8;
  return {
    minLat: round(tile.row * tileSize),
    maxLat: round((tile.row + 1) * tileSize),
    minLng: round(tile.col * tileSize),
    maxLng: round((tile.col + 1) * tileSize),
  };
}

/**
 * Compute the tile for the center of a bounding box and return
 * that tile's fixed bbox.
 */
export function tileForBbox(
  bbox: BoundingBox,
  tileSize: number = DEFAULT_TILE_SIZE
): { tile: TileCoord; bbox: BoundingBox } {
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const centerLng = (bbox.minLng + bbox.maxLng) / 2;
  const tile = tileForPoint(centerLat, centerLng, tileSize);
  return { tile, bbox: tileBbox(tile, tileSize) };
}

/**
 * Deterministic cache key for a tile.
 *
 * Based on tile grid coordinates + timeout. The key is a 16-char hex
 * hash, filesystem-safe and collision-free for realistic usage.
 */
export function tileCacheKey(tile: TileCoord, timeout: number): string {
  const input = `${tile.row}|${tile.col}|${timeout}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Read a cached Overpass response from disk.
 *
 * @returns Parsed OverpassJson on hit, or null on miss/corruption.
 */
export function readCachedResponse(
  tile: TileCoord,
  timeout: number,
  cacheDir?: string
): OverpassJson | null {
  const dir = cacheDir ?? defaultCacheDir();
  const key = tileCacheKey(tile, timeout);
  const filepath = join(dir, `${key}.json`);

  if (!existsSync(filepath)) return null;

  try {
    const stat = statSync(filepath);
    if (stat.size === 0) return null;

    const raw = readFileSync(filepath, "utf-8");
    return JSON.parse(raw) as OverpassJson;
  } catch {
    return null;
  }
}

/**
 * Write an Overpass response to the disk cache.
 */
export function writeCachedResponse(
  tile: TileCoord,
  timeout: number,
  response: OverpassJson,
  cacheDir?: string
): void {
  const dir = cacheDir ?? defaultCacheDir();
  mkdirSync(dir, { recursive: true });

  const key = tileCacheKey(tile, timeout);
  const filepath = join(dir, `${key}.json`);
  writeFileSync(filepath, JSON.stringify(response));
}

/**
 * Get the cache file path for a tile (for debugging).
 */
export function getCachePath(
  tile: TileCoord,
  timeout: number,
  cacheDir?: string
): string {
  const dir = cacheDir ?? defaultCacheDir();
  const key = tileCacheKey(tile, timeout);
  return join(dir, `${key}.json`);
}
