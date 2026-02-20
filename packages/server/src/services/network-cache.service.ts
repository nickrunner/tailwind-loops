/**
 * Network disk cache — V8 structured clone serialization.
 *
 * Handles Maps natively, outputs a Buffer (no string length limit),
 * faster + more compact than JSON.
 *
 * Extracted from packages/tuner/src/server.ts
 */

import { createHash } from "node:crypto";
import {
  readFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { serialize, deserialize } from "node:v8";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Graph, CorridorNetwork } from "@tailwind-loops/types";
import type { BoundingBox } from "@tailwind-loops/builder";

import type { CacheEntry, CacheStats } from "../models/responses.js";

/** Metadata stored alongside each cache entry. */
interface CacheMetadata {
  bbox: BoundingBox;
  innerBbox: BoundingBox;
}

/**
 * Parse cache metadata, handling both current and legacy formats.
 * Legacy format stored just a BoundingBox; new format stores { bbox, innerBbox }.
 */
function parseCacheMetadata(raw: unknown): CacheMetadata {
  if (
    raw &&
    typeof raw === "object" &&
    "bbox" in raw &&
    "innerBbox" in raw
  ) {
    return raw as CacheMetadata;
  }
  // Legacy format: raw is a bare BoundingBox — use it as both bbox and innerBbox
  const bbox = raw as BoundingBox;
  return { bbox, innerBbox: bbox };
}

function coordinateInBbox(
  coord: { lat: number; lng: number },
  bbox: BoundingBox,
): boolean {
  return (
    coord.lat >= bbox.minLat &&
    coord.lat <= bbox.maxLat &&
    coord.lng >= bbox.minLng &&
    coord.lng <= bbox.maxLng
  );
}

const NETWORK_CACHE_DIR = join(homedir(), ".tailwind-loops", "network-cache");

function cacheKey(bbox: BoundingBox): string {
  const coords = [
    bbox.minLat.toFixed(4),
    bbox.minLng.toFixed(4),
    bbox.maxLat.toFixed(4),
    bbox.maxLng.toFixed(4),
  ].join(",");
  return createHash("sha256").update(coords).digest("hex").slice(0, 16);
}

function fmtBbox(bbox: BoundingBox): string {
  return `[${bbox.minLat.toFixed(4)},${bbox.minLng.toFixed(4)} → ${bbox.maxLat.toFixed(4)},${bbox.maxLng.toFixed(4)}]`;
}

export class NetworkCacheService {
  /**
   * Find a cached network that covers the given starting coordinate for a
   * route of the given radius.
   *
   * The effective hit zone is computed dynamically by shrinking the cached
   * bbox by neededRadiusKm. This ensures the cached data extends at least
   * neededRadiusKm in every direction from the starting coordinate.
   * A larger route shrinks the hit zone; a route too large for any cached
   * entry results in a miss.
   */
  read(
    startCoordinate: { lat: number; lng: number },
    neededRadiusKm: number,
  ): { graph: Graph; network: CorridorNetwork } | null {
    if (!existsSync(NETWORK_CACHE_DIR)) return null;

    const latShrink = neededRadiusKm / 111.32;

    for (const file of readdirSync(NETWORK_CACHE_DIR)) {
      if (!file.endsWith(".bbox.json")) continue;
      try {
        const raw = JSON.parse(
          readFileSync(join(NETWORK_CACHE_DIR, file), "utf-8"),
        );
        const metadata = parseCacheMetadata(raw);

        // Shrink the cached bbox by the needed route radius to get the
        // effective zone where starting points have full coverage
        const centerLat = (metadata.bbox.minLat + metadata.bbox.maxLat) / 2;
        const lngShrink =
          neededRadiusKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));
        const effectiveHitZone: BoundingBox = {
          minLat: metadata.bbox.minLat + latShrink,
          maxLat: metadata.bbox.maxLat - latShrink,
          minLng: metadata.bbox.minLng + lngShrink,
          maxLng: metadata.bbox.maxLng - lngShrink,
        };

        // Skip if the cached data is too small for this route radius
        if (
          effectiveHitZone.minLat >= effectiveHitZone.maxLat ||
          effectiveHitZone.minLng >= effectiveHitZone.maxLng
        )
          continue;

        if (coordinateInBbox(startCoordinate, effectiveHitZone)) {
          const cachedKey = file.replace(".bbox.json", "");
          const cachedV8 = join(NETWORK_CACHE_DIR, `${cachedKey}.v8`);
          if (!existsSync(cachedV8)) continue;
          const buf = readFileSync(cachedV8);
          console.log(
            `[cache] HIT — coordinate (${startCoordinate.lat.toFixed(4)},${startCoordinate.lng.toFixed(4)}) within effective zone ${fmtBbox(effectiveHitZone)} (radius=${neededRadiusKm}km)`,
          );
          return deserialize(buf) as { graph: Graph; network: CorridorNetwork };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  write(
    bbox: BoundingBox,
    innerBbox: BoundingBox,
    graph: Graph,
    network: CorridorNetwork,
  ): void {
    const key = cacheKey(bbox);
    mkdirSync(NETWORK_CACHE_DIR, { recursive: true });
    const filePath = join(NETWORK_CACHE_DIR, `${key}.v8`);
    const buf = serialize({ graph, network });
    writeFileSync(filePath, buf);
    const metadata: CacheMetadata = { bbox, innerBbox };
    writeFileSync(
      join(NETWORK_CACHE_DIR, `${key}.bbox.json`),
      JSON.stringify(metadata),
    );
    console.log(
      `[cache] Wrote network cache: ${key} (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB), inner=${fmtBbox(innerBbox)}`,
    );
  }

  listEntries(): CacheEntry[] {
    if (!existsSync(NETWORK_CACHE_DIR)) return [];

    const entries: CacheEntry[] = [];
    for (const file of readdirSync(NETWORK_CACHE_DIR)) {
      if (!file.endsWith(".bbox.json")) continue;
      try {
        const id = file.replace(".bbox.json", "");
        const raw = JSON.parse(
          readFileSync(join(NETWORK_CACHE_DIR, file), "utf-8"),
        );
        const metadata = parseCacheMetadata(raw);
        const v8Path = join(NETWORK_CACHE_DIR, `${id}.v8`);
        const sizeMB = existsSync(v8Path)
          ? Math.round((statSync(v8Path).size / 1024 / 1024) * 10) / 10
          : 0;
        entries.push({ id, bbox: metadata.bbox, innerBbox: metadata.innerBbox, sizeMB });
      } catch {
        continue;
      }
    }
    return entries;
  }

  clearAll(): number {
    if (!existsSync(NETWORK_CACHE_DIR)) return 0;
    const count = readdirSync(NETWORK_CACHE_DIR).filter(
      (f) => f.endsWith(".v8") || f.endsWith(".bbox.json"),
    ).length;
    rmSync(NETWORK_CACHE_DIR, { recursive: true });
    console.log(`[cache] Cleared ${count} cached file(s)`);
    return count;
  }

  clearEntry(id: string): boolean {
    const v8Path = join(NETWORK_CACHE_DIR, `${id}.v8`);
    const bboxPath = join(NETWORK_CACHE_DIR, `${id}.bbox.json`);
    let removed = false;
    if (existsSync(v8Path)) {
      rmSync(v8Path);
      removed = true;
    }
    if (existsSync(bboxPath)) {
      rmSync(bboxPath);
      removed = true;
    }
    if (removed) console.log(`[cache] Cleared cache entry: ${id}`);
    return removed;
  }

  getStats(): CacheStats {
    if (!existsSync(NETWORK_CACHE_DIR)) return { entries: 0, totalSizeMB: 0 };

    let totalBytes = 0;
    let entryCount = 0;
    for (const file of readdirSync(NETWORK_CACHE_DIR)) {
      if (!file.endsWith(".v8")) continue;
      entryCount++;
      totalBytes += statSync(join(NETWORK_CACHE_DIR, file)).size;
    }
    return {
      entries: entryCount,
      totalSizeMB: Math.round((totalBytes / 1024 / 1024) * 10) / 10,
    };
  }
}
