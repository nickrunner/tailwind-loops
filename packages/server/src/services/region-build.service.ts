/**
 * Region build service — Overpass fetch + graph build + corridor build.
 *
 * Orchestrates the full pipeline from coordinates to a scored corridor network.
 * Extracted from packages/tuner/src/server.ts
 */

import {
  buildOverpassQuery,
  parseOverpassResponse,
  buildGraphFromOsm,
  buildCorridors,
  bboxFromCenter,
  expandBbox,
  type BoundingBox,
  type OsmNode,
  type OsmWay,
} from "@tailwind-loops/builder";
import type { Graph, CorridorNetwork } from "@tailwind-loops/types";
import { NetworkCacheService } from "./network-cache.service.js";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const OVERPASS_MAX_RETRIES = 3;
const OVERPASS_RETRY_DELAYS = [2000, 5000, 10000];
const DEFAULT_RADIUS_KM = 5;

async function fetchOverpassWithRetry(query: string): Promise<unknown> {
  for (let attempt = 0; attempt <= OVERPASS_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(OVERPASS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (res.ok) {
        return await res.json();
      }

      if (res.status >= 429 && attempt < OVERPASS_MAX_RETRIES) {
        const delay = OVERPASS_RETRY_DELAYS[attempt] ?? 10000;
        console.log(
          `[overpass] ${res.status} ${res.statusText} — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${OVERPASS_MAX_RETRIES})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
    } catch (err) {
      if (
        attempt < OVERPASS_MAX_RETRIES &&
        !(err instanceof Error && err.message.startsWith("Overpass API error"))
      ) {
        const delay = OVERPASS_RETRY_DELAYS[attempt] ?? 10000;
        console.log(
          `[overpass] Network error: ${err} — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${OVERPASS_MAX_RETRIES})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Overpass API: max retries exceeded");
}

function fmtBbox(bbox: BoundingBox): string {
  return `[${bbox.minLat.toFixed(4)},${bbox.minLng.toFixed(4)} → ${bbox.maxLat.toFixed(4)},${bbox.maxLng.toFixed(4)}]`;
}

export class RegionBuildService {
  private cache = new NetworkCacheService();

  getCache(): NetworkCacheService {
    return this.cache;
  }

  /**
   * Build or retrieve a corridor network for the area around a coordinate.
   * Uses the network cache to avoid redundant Overpass fetches.
   */
  async buildForCoordinate(
    startCoordinate: { lat: number; lng: number },
    maxDistanceMeters: number,
  ): Promise<{ graph: Graph; network: CorridorNetwork; bbox: BoundingBox }> {
    const radiusKm = Math.max(
      DEFAULT_RADIUS_KM,
      Math.ceil((maxDistanceMeters / 1000) / 2),
    );
    const startBbox = bboxFromCenter(startCoordinate, radiusKm);
    const bufferedBbox = expandBbox(startBbox, 5);
    console.log(
      `[region] radius=${radiusKm}km, bbox=${fmtBbox(bufferedBbox)}`,
    );

    // Check disk cache first
    const cached = this.cache.read(bufferedBbox);
    if (cached) {
      console.log(`[region] Network cache HIT — skipping fetch + build`);
      return { graph: cached.graph, network: cached.network, bbox: bufferedBbox };
    }

    console.log(`[region] Network cache MISS — fetching + building`);

    // Overpass fetch with retry
    const fetchStart = Date.now();
    const query = buildOverpassQuery(bufferedBbox);
    const data = await fetchOverpassWithRetry(query);

    // Parse into local node/way maps
    const localNodes = new Map<number, OsmNode>();
    const localWays = new Map<number, OsmWay>();
    for await (const el of parseOverpassResponse(data as Parameters<typeof parseOverpassResponse>[0])) {
      if (el.type === "node") localNodes.set(el.id, el);
      else localWays.set(el.id, el);
    }
    console.log(
      `[region] Overpass fetch: ${Date.now() - fetchStart}ms — ${localNodes.size.toLocaleString()} nodes, ${localWays.size.toLocaleString()} ways`,
    );

    // Build graph
    async function* allElements(): AsyncGenerator<OsmNode | OsmWay> {
      for (const node of localNodes.values()) yield node;
      for (const way of localWays.values()) yield way;
    }

    const graphStart = Date.now();
    const { graph, stats: graphStats } = await buildGraphFromOsm(
      allElements(),
    );
    console.log(
      `[region] Graph built in ${Date.now() - graphStart}ms: ${graphStats.edgesCount.toLocaleString()} edges`,
    );

    // Skip elevation enrichment (per plan)

    // Build corridors
    const corridorStart = Date.now();
    const { network, stats: corridorStats } = await buildCorridors(graph);
    console.log(
      `[region] Corridors built in ${Date.now() - corridorStart}ms: ${corridorStats.corridorCount} corridors, ${corridorStats.connectorCount} connectors`,
    );

    // Write to disk cache
    this.cache.write(bufferedBbox, graph, network);

    return { graph, network, bbox: bufferedBbox };
  }
}
