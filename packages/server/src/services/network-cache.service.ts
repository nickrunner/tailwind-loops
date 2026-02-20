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

function bboxContains(outer: BoundingBox, inner: BoundingBox): boolean {
  return (
    outer.minLat <= inner.minLat &&
    outer.minLng <= inner.minLng &&
    outer.maxLat >= inner.maxLat &&
    outer.maxLng >= inner.maxLng
  );
}

function fmtBbox(bbox: BoundingBox): string {
  return `[${bbox.minLat.toFixed(4)},${bbox.minLng.toFixed(4)} → ${bbox.maxLat.toFixed(4)},${bbox.maxLng.toFixed(4)}]`;
}

export class NetworkCacheService {
  read(bbox: BoundingBox): { graph: Graph; network: CorridorNetwork } | null {
    // Fast path: exact bbox match
    const key = cacheKey(bbox);
    const filePath = join(NETWORK_CACHE_DIR, `${key}.v8`);
    if (existsSync(filePath)) {
      try {
        const buf = readFileSync(filePath);
        return deserialize(buf) as { graph: Graph; network: CorridorNetwork };
      } catch {
        // fall through to containment check
      }
    }

    // Slow path: check if any cached bbox fully contains the requested bbox
    if (!existsSync(NETWORK_CACHE_DIR)) return null;
    for (const file of readdirSync(NETWORK_CACHE_DIR)) {
      if (!file.endsWith(".bbox.json")) continue;
      try {
        const cachedBbox = JSON.parse(
          readFileSync(join(NETWORK_CACHE_DIR, file), "utf-8"),
        ) as BoundingBox;
        if (bboxContains(cachedBbox, bbox)) {
          const cachedKey = file.replace(".bbox.json", "");
          const cachedV8 = join(NETWORK_CACHE_DIR, `${cachedKey}.v8`);
          if (!existsSync(cachedV8)) continue;
          const buf = readFileSync(cachedV8);
          console.log(
            `[cache] Containment HIT — requested ${fmtBbox(bbox)} fits inside cached ${fmtBbox(cachedBbox)}`,
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
    graph: Graph,
    network: CorridorNetwork,
  ): void {
    const key = cacheKey(bbox);
    mkdirSync(NETWORK_CACHE_DIR, { recursive: true });
    const filePath = join(NETWORK_CACHE_DIR, `${key}.v8`);
    const buf = serialize({ graph, network });
    writeFileSync(filePath, buf);
    writeFileSync(
      join(NETWORK_CACHE_DIR, `${key}.bbox.json`),
      JSON.stringify(bbox),
    );
    console.log(
      `[cache] Wrote network cache: ${key} (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB)`,
    );
  }

  listEntries(): CacheEntry[] {
    if (!existsSync(NETWORK_CACHE_DIR)) return [];

    const entries: CacheEntry[] = [];
    for (const file of readdirSync(NETWORK_CACHE_DIR)) {
      if (!file.endsWith(".bbox.json")) continue;
      try {
        const id = file.replace(".bbox.json", "");
        const bbox = JSON.parse(
          readFileSync(join(NETWORK_CACHE_DIR, file), "utf-8"),
        ) as BoundingBox;
        const v8Path = join(NETWORK_CACHE_DIR, `${id}.v8`);
        const sizeMB = existsSync(v8Path)
          ? Math.round((statSync(v8Path).size / 1024 / 1024) * 10) / 10
          : 0;
        entries.push({ id, bbox, sizeMB });
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
