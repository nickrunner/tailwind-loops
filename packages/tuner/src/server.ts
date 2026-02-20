/**
 * Scoring Tuner — local dev server.
 *
 * Serves a web UI for tuning scoring parameters and generating routes.
 * Route generation fetches OSM data directly from Overpass for the exact
 * area needed, builds a corridor network, and caches it to disk.
 *
 * Usage: pnpm start
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { serialize, deserialize } from "node:v8";
import { homedir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCorridors,
  buildGraphFromOsm,
  bboxFromCenter,
  expandBbox,
  buildOverpassQuery,
  parseOverpassResponse,
  enrichElevation,
} from "@tailwind-loops/builder";
import type { OsmNode, OsmWay, BoundingBox } from "@tailwind-loops/builder";
import {
  loadBaseConfig,
  loadProfileConfig,
  listProfiles,
  saveBaseConfig,
  saveProfileConfig,
  scoreCorridorWithParams,
  corridorNetworkToGeoJson,
  generateLoopRoutes,
} from "@tailwind-loops/routing";
import type {
  ScoringParams,
  ActivityType,
  CorridorNetwork,
  LoopSearchParams,
} from "@tailwind-loops/routing";
import type { Graph } from "@tailwind-loops/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = resolve(__dirname, "../public");
const SRTM_DIR = resolve(__dirname, "../../../data/michigan/grand-rapids");

const PORT = parseInt(process.env["PORT"] ?? "3456", 10);
const DEFAULT_RADIUS_KM = 5;

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

// ---------------------------------------------------------------------------
// Network disk cache — V8 structured clone serialization.
// Handles Maps natively, outputs a Buffer (no string length limit),
// faster + more compact than JSON.
// ---------------------------------------------------------------------------

const NETWORK_CACHE_DIR = join(homedir(), ".tailwind-loops", "network-cache");

function networkCacheKey(bbox: BoundingBox): string {
  const coords = [
    bbox.minLat.toFixed(4),
    bbox.minLng.toFixed(4),
    bbox.maxLat.toFixed(4),
    bbox.maxLng.toFixed(4),
  ].join(",");
  return createHash("sha256").update(coords).digest("hex").slice(0, 16);
}

function readNetworkCache(bbox: BoundingBox): { graph: Graph; network: CorridorNetwork } | null {
  const key = networkCacheKey(bbox);
  const filePath = join(NETWORK_CACHE_DIR, `${key}.v8`);
  if (!existsSync(filePath)) return null;
  try {
    const buf = readFileSync(filePath);
    return deserialize(buf) as { graph: Graph; network: CorridorNetwork };
  } catch {
    return null;
  }
}

function writeNetworkCache(bbox: BoundingBox, graph: Graph, net: CorridorNetwork): void {
  const key = networkCacheKey(bbox);
  mkdirSync(NETWORK_CACHE_DIR, { recursive: true });
  const filePath = join(NETWORK_CACHE_DIR, `${key}.v8`);
  const buf = serialize({ graph, network: net });
  writeFileSync(filePath, buf);
  console.log(`[cache] Wrote network cache: ${key} (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB)`);
}

function fmtBbox(bbox: BoundingBox): string {
  return `[${bbox.minLat.toFixed(4)},${bbox.minLng.toFixed(4)} → ${bbox.maxLat.toFixed(4)},${bbox.maxLng.toFixed(4)}]`;
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function handleDefaults(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const profileName = url.searchParams.get("profile");

  if (profileName) {
    try {
      const result = loadProfileConfig(profileName);
      sendJson(res, result);
    } catch (err) {
      sendJson(res, { error: String(err) }, 404);
    }
    return;
  }

  const activity = (url.searchParams.get("activity") ?? "road-cycling") as ActivityType;
  sendJson(res, loadBaseConfig(activity));
}

function handleProfiles(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, listProfiles());
}

function handleScore(req: IncomingMessage, res: ServerResponse): void {
  // Score endpoint uses the last generated route's network (stored per-request via generate-route)
  // For now, return empty if no route has been generated
  sendJson(res, { features: [], _meta: { corridorCount: 0, scoringTimeMs: 0 } });
}

function handleSave(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
      const { activityType, params, profileName, asBase } = JSON.parse(body) as {
        activityType: ActivityType;
        params: ScoringParams;
        profileName?: string;
        asBase?: boolean;
      };

      if (profileName && !asBase) {
        saveProfileConfig(profileName, params, activityType, "");
        console.log(`Saved profile "${profileName}" (extends ${activityType})`);
        sendJson(res, { saved: true, profileName, activityType });
      } else {
        saveBaseConfig(activityType, params);
        console.log(`Saved ${activityType} base config to JSON`);
        sendJson(res, { saved: true, activityType });
      }
    } catch (err) {
      sendJson(res, { error: String(err) }, 500);
    }
  });
}

function handleSaveAs(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
      const { name, description, activityType, params } = JSON.parse(body) as {
        name: string;
        description: string;
        activityType: ActivityType;
        params: ScoringParams;
      };

      if (!name) {
        sendJson(res, { error: "Profile name is required" }, 400);
        return;
      }

      saveProfileConfig(name, params, activityType, description);
      console.log(`Saved new profile "${name}" (extends ${activityType})`);
      sendJson(res, { saved: true, name, activityType });
    } catch (err) {
      sendJson(res, { error: String(err) }, 500);
    }
  });
}

function handleDemCoverage(_req: IncomingMessage, res: ServerResponse): void {
  const tiles: { filename: string; bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } }[] = [];

  if (existsSync(SRTM_DIR)) {
    for (const file of readdirSync(SRTM_DIR)) {
      const match = file.match(/^([NS])(\d{2})([EW])(\d{3})\.hgt$/);
      if (!match) continue;
      const lat = parseInt(match[2]!, 10) * (match[1] === "N" ? 1 : -1);
      const lng = parseInt(match[4]!, 10) * (match[3] === "E" ? 1 : -1);
      tiles.push({
        filename: file,
        bounds: { minLat: lat, maxLat: lat + 1, minLng: lng, maxLng: lng + 1 },
      });
    }
  }

  sendJson(res, { tilesDir: SRTM_DIR, tiles });
}

function handleClearNetworkCache(_req: IncomingMessage, res: ServerResponse): void {
  let cleared = 0;
  try {
    if (existsSync(NETWORK_CACHE_DIR)) {
      cleared = readdirSync(NETWORK_CACHE_DIR).length;
      rmSync(NETWORK_CACHE_DIR, { recursive: true });
      console.log(`[cache] Cleared ${cleared} cached file(s)`);
    }
    sendJson(res, { cleared });
  } catch (err) {
    sendJson(res, { error: String(err) }, 500);
  }
}

function handleGenerateRoute(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    const parsed = JSON.parse(body) as {
      activityType: ActivityType;
      scoringParams: ScoringParams;
      loopSearchParams: LoopSearchParams;
    };

    doGenerateRoute(parsed, res).catch((err) => {
      console.error("[generate-route] Error:", err);
      sendJson(res, { error: String(err) }, 400);
    });
  });
}

async function doGenerateRoute(
  { activityType, scoringParams, loopSearchParams }: {
    activityType: ActivityType;
    scoringParams: ScoringParams;
    loopSearchParams: LoopSearchParams;
  },
  res: ServerResponse,
): Promise<void> {
  // Compute bbox centered on start coordinate with enough radius for the loop.
  // A loop can extend up to ~targetDistance/2.5 from start — elongated loops
  // reach further than circular ones. Add 5km buffer for road network edges.
  const radiusKm = Math.max(
    DEFAULT_RADIUS_KM,
    Math.ceil((loopSearchParams.targetDistanceMeters / 1000) / 2),
  );
  const startBbox = bboxFromCenter(loopSearchParams.startCoordinate, radiusKm);
  const bufferedBbox = expandBbox(startBbox, 5);
  console.log(`[generate-route] radius=${radiusKm}km, bbox=${fmtBbox(bufferedBbox)}`);

  let localGraph: Graph;
  let localNetwork: CorridorNetwork;

  // Check disk cache first
  const cached = readNetworkCache(bufferedBbox);
  if (cached) {
    console.log(`[generate-route] Network cache HIT — skipping fetch + build`);
    localGraph = cached.graph;
    localNetwork = cached.network;
  } else {
    console.log(`[generate-route] Network cache MISS — fetching + building`);

    // Direct Overpass fetch for the exact bbox
    const fetchStart = Date.now();
    const query = buildOverpassQuery(bufferedBbox);
    const overpassRes = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!overpassRes.ok) {
      throw new Error(`Overpass API error: ${overpassRes.status} ${overpassRes.statusText}`);
    }
    const data = await overpassRes.json();

    // Parse into local node/way maps
    const localNodes = new Map<number, OsmNode>();
    const localWays = new Map<number, OsmWay>();
    for await (const el of parseOverpassResponse(data)) {
      if (el.type === "node") localNodes.set(el.id, el);
      else localWays.set(el.id, el);
    }
    console.log(`[generate-route] Overpass fetch: ${Date.now() - fetchStart}ms — ${localNodes.size.toLocaleString()} nodes, ${localWays.size.toLocaleString()} ways`);

    // Build graph
    async function* allElements(): AsyncGenerator<OsmNode | OsmWay> {
      for (const node of localNodes.values()) yield node;
      for (const way of localWays.values()) yield way;
    }

    const graphStart = Date.now();
    const { graph: builtGraph, stats: graphStats } = await buildGraphFromOsm(allElements());
    localGraph = builtGraph;
    console.log(`[generate-route] Graph built in ${Date.now() - graphStart}ms: ${graphStats.edgesCount.toLocaleString()} edges`);

    // Elevation enrichment
    if (existsSync(SRTM_DIR)) {
      const elevStart = Date.now();
      const elevStats = enrichElevation(localGraph, { dem: { tilesDir: SRTM_DIR } });
      console.log(`[generate-route] Elevation enriched in ${Date.now() - elevStart}ms: ${elevStats.nodesEnriched.toLocaleString()} nodes`);
    }

    // Build corridors
    const corridorStart = Date.now();
    const { network: builtNetwork, stats: corridorStats } = await buildCorridors(localGraph);
    localNetwork = builtNetwork;
    console.log(`[generate-route] Corridors built in ${Date.now() - corridorStart}ms: ${corridorStats.corridorCount} corridors, ${corridorStats.connectorCount} connectors`);

    // Write to disk cache
    writeNetworkCache(bufferedBbox, localGraph, localNetwork);
  }

  console.log(`[generate-route] ${activityType}, target=${(loopSearchParams.targetDistanceMeters/1609.34).toFixed(1)}mi, start=(${loopSearchParams.startCoordinate.lat.toFixed(4)}, ${loopSearchParams.startCoordinate.lng.toFixed(4)})`);
  console.log(`[generate-route] Network: ${localNetwork.corridors.size} corridors, ${localNetwork.connectors.size} connectors`);

  const start = performance.now();

  // Re-score corridors with provided params
  for (const corridor of localNetwork.corridors.values()) {
    const score = scoreCorridorWithParams(corridor, scoringParams);
    if (!corridor.scores) corridor.scores = {};
    corridor.scores[activityType] = score;
  }

  console.log(`[generate-route] Scored in ${(performance.now() - start).toFixed(0)}ms. Running route search...`);

  // Generate loop routes
  const result = generateLoopRoutes(localNetwork, localGraph, activityType, loopSearchParams);

  if (!result) {
    sendJson(res, { error: "No routes found. Try adjusting distance or start location." }, 404);
    return;
  }

  const elapsed = performance.now() - start;

  // Convert route geometries to GeoJSON for map display
  const features = [result.primary, ...result.alternatives].map((route, idx) => ({
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: route.geometry.map((c) => [c.lng, c.lat] as [number, number]),
    },
    properties: {
      routeIndex: idx,
      isPrimary: idx === 0,
      score: Math.round(route.score * 1000) / 1000,
      distanceMeters: Math.round(route.stats.totalDistanceMeters),
      distanceKm: Math.round(route.stats.totalDistanceMeters / 100) / 10,
      totalStops: route.stats.totalStops,
      flowScore: route.stats.flowScore,
      segmentCount: route.segments.length,
      elevationGain: route.stats.elevationGainMeters ?? null,
      elevationLoss: route.stats.elevationLossMeters ?? null,
      surfacePaved: route.stats.distanceBySurface?.paved ?? 0,
      surfaceUnpaved: route.stats.distanceBySurface?.unpaved ?? 0,
      surfaceUnknown: route.stats.distanceBySurface?.unknown ?? 0,
      stroke: idx === 0 ? "#2563eb" : "#9333ea",
      "stroke-width": idx === 0 ? 4 : 3,
      "stroke-opacity": idx === 0 ? 0.9 : 0.6,
    },
  }));

  // Build corridor GeoJSON filtered to types used in search
  const corridorGeoJson = corridorNetworkToGeoJson(localNetwork, {
    includeConnectors: false,
    scoreActivity: activityType,
  });
  const excludedTypes = new Set(["path", "trail"]);
  const excludedRoadClasses = new Set(["service", "track", "footway"]);
  const filteredCorridorFeatures = corridorGeoJson.features.filter((f: any) => {
    const ct = f.properties?.corridorType;
    const surface = f.properties?.predominantSurface;
    const roadClass = f.properties?.roadClass;
    if (excludedTypes.has(ct)) return false;
    if (activityType === "road-cycling" && surface === "unpaved") return false;
    if (activityType === "road-cycling" && excludedRoadClasses.has(roadClass)) return false;
    return true;
  });

  sendJson(res, {
    type: "FeatureCollection",
    features,
    _meta: {
      routeCount: 1 + result.alternatives.length,
      searchTimeMs: Math.round(elapsed * 100) / 100,
      primary: result.primary.stats,
    },
    corridorNetwork: {
      type: "FeatureCollection",
      features: filteredCorridorFeatures,
      _meta: { corridorCount: filteredCorridorFeatures.length },
    },
  });
}

function serveStatic(res: ServerResponse, filename: string, contentType: string): void {
  try {
    const content = readFileSync(resolve(PUBLIC_DIR, filename));
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length,
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (url === "/" || url === "/index.html") {
    serveStatic(res, "index.html", "text/html; charset=utf-8");
  } else if (url.startsWith("/api/defaults")) {
    handleDefaults(req, res);
  } else if (url.startsWith("/api/profiles")) {
    handleProfiles(req, res);
  } else if (url === "/api/save" && method === "POST") {
    handleSave(req, res);
  } else if (url === "/api/save-as" && method === "POST") {
    handleSaveAs(req, res);
  } else if (url === "/api/dem-coverage") {
    handleDemCoverage(req, res);
  } else if (url === "/api/generate-route" && method === "POST") {
    handleGenerateRoute(req, res);
  } else if (url === "/api/clear-network-cache" && method === "DELETE") {
    handleClearNetworkCache(req, res);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  server.listen(PORT, () => {
    console.log(`\nScoring Tuner running at http://localhost:${PORT}\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
