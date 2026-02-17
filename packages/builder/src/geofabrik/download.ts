/**
 * PBF download with local caching.
 *
 * Downloads OSM PBF files from Geofabrik and caches them locally
 * in ~/.tailwind-loops/pbf/ to avoid repeated downloads.
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { resolveRegion, type GeofabrikRegion } from "./regions.js";

/** Options for downloading a PBF file */
export interface DownloadOptions {
  /** Override the cache directory (default: ~/.tailwind-loops/pbf/) */
  cacheDir?: string;
  /** Force re-download even if cached */
  force?: boolean;
  /** Progress callback: called with (bytesDownloaded, totalBytes | undefined) */
  onProgress?: (downloaded: number, total: number | undefined) => void;
}

/** Default cache directory */
function defaultCacheDir(): string {
  return join(homedir(), ".tailwind-loops", "pbf");
}

/**
 * Download a PBF file for a region, using local cache.
 *
 * @param regionKey - Key from US_STATES (e.g. "michigan")
 * @param options - Download options
 * @returns Path to the local PBF file
 */
export async function downloadPbf(
  regionKey: string,
  options: DownloadOptions = {}
): Promise<string> {
  const region = resolveRegion(regionKey);
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const filename = `${regionKey}-latest.osm.pbf`;
  const filepath = join(cacheDir, filename);

  // Check cache
  if (!options.force && existsSync(filepath)) {
    const stat = statSync(filepath);
    if (stat.size > 0) {
      return filepath;
    }
  }

  // Ensure cache directory exists
  mkdirSync(cacheDir, { recursive: true });

  // Download
  await streamDownload(region, filepath, options.onProgress);

  return filepath;
}

/**
 * Stream download a PBF file from Geofabrik.
 */
async function streamDownload(
  region: GeofabrikRegion,
  filepath: string,
  onProgress?: (downloaded: number, total: number | undefined) => void
): Promise<void> {
  const response = await fetch(region.url);

  if (!response.ok) {
    throw new Error(`Failed to download ${region.url}: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error(`No response body from ${region.url}`);
  }

  const totalBytes = response.headers.get("content-length");
  const total = totalBytes ? parseInt(totalBytes, 10) : undefined;

  let downloaded = 0;
  const reader = response.body.getReader();

  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
        return;
      }
      downloaded += value.byteLength;
      onProgress?.(downloaded, total);
      this.push(Buffer.from(value));
    },
  });

  const writeStream = createWriteStream(filepath);
  await pipeline(nodeStream, writeStream);
}
