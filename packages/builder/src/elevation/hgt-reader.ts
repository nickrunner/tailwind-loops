/**
 * SRTM HGT file reader for elevation lookups.
 *
 * Reads 1-arcsecond (~30m) SRTM tiles in the standard .hgt binary format.
 * Each tile covers 1° × 1° and contains 3601 × 3601 signed 16-bit integers
 * in big-endian byte order.
 *
 * Features:
 * - Bilinear interpolation between 4 nearest grid points
 * - LRU tile cache (default 4 tiles, ~100MB max)
 * - Graceful null return when tile missing or void (-32768)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Configuration for the DEM reader */
export interface DemConfig {
  /** Directory containing .hgt files */
  tilesDir: string;
  /** Maximum number of tiles to cache (default: 4) */
  maxCachedTiles?: number;
}

/** Void value in SRTM data */
const SRTM_VOID = -32768;

/** Number of samples per row/column in a 1-arcsecond SRTM tile */
const SRTM_SIZE = 3601;

/** Expected byte length of a 1-arcsecond .hgt file */
const SRTM_BYTES = SRTM_SIZE * SRTM_SIZE * 2;

/** A cached SRTM tile */
interface CachedTile {
  key: string;
  data: DataView;
  lastUsed: number;
}

/**
 * DEM reader with LRU tile cache.
 *
 * Usage:
 * ```ts
 * const dem = new DemReader({ tilesDir: "./srtm" });
 * const elev = dem.getElevation(47.6062, -122.3321);
 * ```
 */
export class DemReader {
  private readonly tilesDir: string;
  private readonly maxCachedTiles: number;
  private readonly cache: Map<string, CachedTile> = new Map();
  private accessCounter = 0;

  constructor(config: DemConfig) {
    this.tilesDir = config.tilesDir;
    this.maxCachedTiles = config.maxCachedTiles ?? 4;
  }

  /**
   * Get elevation for a single coordinate.
   * Returns null if the tile is missing or the point is void.
   */
  getElevation(lat: number, lng: number): number | null {
    const tile = this.loadTile(lat, lng);
    if (!tile) return null;
    return this.interpolate(tile, lat, lng);
  }

  /**
   * Get elevations for multiple coordinates (batch lookup).
   * Returns an array of elevations (or null for missing/void points).
   */
  getElevations(coords: { lat: number; lng: number }[]): (number | null)[] {
    return coords.map((c) => this.getElevation(c.lat, c.lng));
  }

  /**
   * Generate the .hgt filename for a coordinate.
   * E.g., (47.6, -122.3) → "N47W123.hgt"
   */
  static tileFilename(lat: number, lng: number): string {
    const latFloor = Math.floor(lat);
    const lngFloor = Math.floor(lng);
    const latPrefix = latFloor >= 0 ? "N" : "S";
    const lngPrefix = lngFloor >= 0 ? "E" : "W";
    const latStr = String(Math.abs(latFloor)).padStart(2, "0");
    const lngStr = String(Math.abs(lngFloor)).padStart(3, "0");
    return `${latPrefix}${latStr}${lngPrefix}${lngStr}.hgt`;
  }

  /** Load a tile from cache or disk. Returns null if file doesn't exist. */
  private loadTile(lat: number, lng: number): DataView | null {
    const key = DemReader.tileFilename(lat, lng);

    const cached = this.cache.get(key);
    if (cached) {
      cached.lastUsed = ++this.accessCounter;
      return cached.data;
    }

    const filePath = join(this.tilesDir, key);
    if (!existsSync(filePath)) return null;

    const buffer = readFileSync(filePath);
    if (buffer.byteLength !== SRTM_BYTES) return null;

    const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxCachedTiles) {
      this.evictLru();
    }

    this.cache.set(key, { key, data, lastUsed: ++this.accessCounter });
    return data;
  }

  /** Evict the least recently used tile from the cache. */
  private evictLru(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, tile] of this.cache) {
      if (tile.lastUsed < oldestTime) {
        oldestTime = tile.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Bilinear interpolation between 4 nearest grid points.
   * Returns null if any of the 4 corners is void.
   */
  private interpolate(tile: DataView, lat: number, lng: number): number | null {
    const latFloor = Math.floor(lat);
    const lngFloor = Math.floor(lng);

    // Position within the tile (0..1)
    const fracLat = lat - latFloor;
    const fracLng = lng - lngFloor;

    // Row/column indices. SRTM tiles go from south to north (row 0 = north edge).
    // Column 0 = west edge.
    const row = (1 - fracLat) * (SRTM_SIZE - 1);
    const col = fracLng * (SRTM_SIZE - 1);

    const r0 = Math.floor(row);
    const c0 = Math.floor(col);
    const r1 = Math.min(r0 + 1, SRTM_SIZE - 1);
    const c1 = Math.min(c0 + 1, SRTM_SIZE - 1);

    const dr = row - r0;
    const dc = col - c0;

    const e00 = this.getSample(tile, r0, c0);
    const e01 = this.getSample(tile, r0, c1);
    const e10 = this.getSample(tile, r1, c0);
    const e11 = this.getSample(tile, r1, c1);

    if (e00 === null || e01 === null || e10 === null || e11 === null) {
      return null;
    }

    // Bilinear interpolation
    return (
      e00 * (1 - dr) * (1 - dc) +
      e01 * (1 - dr) * dc +
      e10 * dr * (1 - dc) +
      e11 * dr * dc
    );
  }

  /** Read a single sample from the tile. Returns null for void values. */
  private getSample(tile: DataView, row: number, col: number): number | null {
    const offset = (row * SRTM_SIZE + col) * 2;
    const value = tile.getInt16(offset, false); // big-endian
    return value === SRTM_VOID ? null : value;
  }
}
