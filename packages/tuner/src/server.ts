/**
 * Scoring Tuner — local dev server.
 *
 * Ingests OSM + builds corridors once at startup, then serves a web UI
 * that lets you tweak scoring parameters and see the results on a map
 * in real time.
 *
 * Data sources (tried in order):
 * 1. Local PBF file (if data/grand-rapids.osm.pbf exists)
 * 2. Overpass API for a default location (Grand Rapids, MI)
 *
 * The UI supports loading corridors for the current map view via Overpass.
 *
 * Usage: pnpm start
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCorridors,
  buildGraphFromOsm,
  parseOsmPbf,
  bboxFromCenter,
  expandBbox,
  fetchOverpassData,
  parseOverpassResponse,
} from "@tailwind-loops/builder";
import type { OsmNode, OsmWay, BoundingBox } from "@tailwind-loops/builder";
import {
  getDefaultScoringParams,
  scoreCorridorWithParams,
  corridorNetworkToGeoJson,
} from "@tailwind-loops/routing";
import type {
  ScoringParams,
  ActivityType,
  CorridorNetwork,
} from "@tailwind-loops/routing";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = resolve(__dirname, "../public");
const PBF_PATH = resolve(__dirname, "../../../data/grand-rapids.osm.pbf");
const SCORING_TS_PATH = resolve(__dirname, "../../routing/src/corridors/scoring.ts");

const PORT = parseInt(process.env["PORT"] ?? "3456", 10);

// Default location: downtown Grand Rapids, MI
const DEFAULT_CENTER = { lat: 42.9634, lng: -85.6681 };
const DEFAULT_RADIUS_KM = 5;

// ---------------------------------------------------------------------------
// Data loading — accumulates raw OSM elements across fetches so that
// corridors are always built from a single contiguous graph.
// ---------------------------------------------------------------------------

let network: CorridorNetwork;
let loadingInProgress = false;

// Accumulated raw elements (deduplicated by OSM ID)
const accumulatedNodes = new Map<number, OsmNode>();
const accumulatedWays = new Map<number, OsmWay>();
// Union of all buffered bboxes we've fetched — used to skip redundant queries
let coveredBbox: BoundingBox | null = null;

function bboxContains(outer: BoundingBox, inner: BoundingBox): boolean {
  return (
    inner.minLat >= outer.minLat &&
    inner.maxLat <= outer.maxLat &&
    inner.minLng >= outer.minLng &&
    inner.maxLng <= outer.maxLng
  );
}

function unionBbox(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    minLat: Math.min(a.minLat, b.minLat),
    maxLat: Math.max(a.maxLat, b.maxLat),
    minLng: Math.min(a.minLng, b.minLng),
    maxLng: Math.max(a.maxLng, b.maxLng),
  };
}

/** Rebuild graph + corridors from all accumulated elements. */
async function rebuildFromAccumulated(): Promise<{
  corridorCount: number;
  connectorCount: number;
}> {
  async function* allElements(): AsyncGenerator<OsmNode | OsmWay> {
    for (const node of accumulatedNodes.values()) yield node;
    for (const way of accumulatedWays.values()) yield way;
  }

  console.log(
    `  Building graph from ${accumulatedNodes.size.toLocaleString()} nodes, ${accumulatedWays.size.toLocaleString()} ways...`,
  );
  const graphStart = Date.now();
  const { graph, stats: graphStats } = await buildGraphFromOsm(allElements());
  console.log(
    `  Graph built in ${Date.now() - graphStart}ms: ${graphStats.edgesCount.toLocaleString()} edges`,
  );

  console.log("  Building corridors...");
  const corridorStart = Date.now();
  const { network: net, stats } = await buildCorridors(graph);
  network = net;
  console.log(
    `  Corridors built in ${Date.now() - corridorStart}ms: ${stats.corridorCount.toLocaleString()} corridors, ${stats.connectorCount.toLocaleString()} connectors`,
  );

  return {
    corridorCount: stats.corridorCount,
    connectorCount: stats.connectorCount,
  };
}

/** Infer covered bbox from accumulated node coordinates. */
function inferCoveredBbox(): BoundingBox | null {
  if (accumulatedNodes.size === 0) return null;
  let minLat = Infinity,
    maxLat = -Infinity;
  let minLng = Infinity,
    maxLng = -Infinity;
  for (const node of accumulatedNodes.values()) {
    if (node.lat < minLat) minLat = node.lat;
    if (node.lat > maxLat) maxLat = node.lat;
    if (node.lon < minLng) minLng = node.lon;
    if (node.lon > maxLng) maxLng = node.lon;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Load data at startup: try PBF first, fall back to Overpass. */
async function loadData(): Promise<void> {
  if (existsSync(PBF_PATH)) {
    console.log("Ingesting OSM data from PBF...");
    const elements = parseOsmPbf(PBF_PATH);
    for await (const el of elements) {
      if (el.type === "node") accumulatedNodes.set(el.id, el);
      else accumulatedWays.set(el.id, el);
    }
    console.log(
      `  Collected ${accumulatedNodes.size.toLocaleString()} nodes, ${accumulatedWays.size.toLocaleString()} ways`,
    );

    console.log("Building corridors...");
    const result = await rebuildFromAccumulated();
    coveredBbox = inferCoveredBbox();
    console.log(
      `  ${result.corridorCount.toLocaleString()} corridors, ${result.connectorCount.toLocaleString()} connectors`,
    );
  } else {
    console.log("No PBF file found, using Overpass API...");
    await fetchAndMerge(bboxFromCenter(DEFAULT_CENTER, DEFAULT_RADIUS_KM));
  }
}

function fmtBbox(bbox: BoundingBox): string {
  return `[${bbox.minLat.toFixed(4)},${bbox.minLng.toFixed(4)} → ${bbox.maxLat.toFixed(4)},${bbox.maxLng.toFixed(4)}]`;
}

/**
 * Fetch Overpass data for an area, merge with accumulated elements,
 * and rebuild corridors. Returns cached: true if the area was already covered.
 */
async function fetchAndMerge(
  viewBbox: BoundingBox,
): Promise<{ cached: boolean; corridorCount: number; connectorCount: number; timeMs: number }> {
  // Already covered? Skip the fetch.
  if (coveredBbox && bboxContains(coveredBbox, viewBbox)) {
    console.log(`[cache hit] ${fmtBbox(viewBbox)} — already covered`);
    return {
      cached: true,
      corridorCount: network.corridors.size,
      connectorCount: network.connectors.size,
      timeMs: 0,
    };
  }

  const start = Date.now();
  const bufferedBbox = expandBbox(viewBbox, 2);

  console.log(`[fetch] Querying Overpass for ${fmtBbox(viewBbox)} (buffered: ${fmtBbox(bufferedBbox)})...`);
  const fetchStart = Date.now();
  const response = await fetchOverpassData(bufferedBbox);
  const fetchMs = Date.now() - fetchStart;
  console.log(`  Overpass responded in ${fetchMs}ms`);

  // Parse and merge into accumulated elements
  const prevNodes = accumulatedNodes.size;
  const prevWays = accumulatedWays.size;
  for await (const el of parseOverpassResponse(response)) {
    if (el.type === "node") accumulatedNodes.set(el.id, el);
    else accumulatedWays.set(el.id, el);
  }
  const newNodes = accumulatedNodes.size - prevNodes;
  const newWays = accumulatedWays.size - prevWays;
  console.log(`  Merged ${newNodes.toLocaleString()} new nodes, ${newWays.toLocaleString()} new ways`);

  // Rebuild corridors from the full accumulated graph
  const result = await rebuildFromAccumulated();

  // Expand covered bbox
  coveredBbox = coveredBbox ? unionBbox(coveredBbox, bufferedBbox) : bufferedBbox;

  const timeMs = Date.now() - start;
  console.log(`[done] Total: ${timeMs}ms`);

  return { cached: false, ...result, timeMs };
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
  const activity = (url.searchParams.get("activity") ?? "road-cycling") as ActivityType;
  sendJson(res, getDefaultScoringParams(activity));
}

function handleScore(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
      const { activityType, params } = JSON.parse(body) as {
        activityType: ActivityType;
        params: ScoringParams;
      };

      const start = performance.now();

      // Re-score all corridors with the provided params
      for (const corridor of network.corridors.values()) {
        const score = scoreCorridorWithParams(corridor, params);
        if (!corridor.scores) corridor.scores = {};
        corridor.scores[activityType] = score;
      }

      const elapsed = performance.now() - start;

      // Build GeoJSON using the shared export utility
      const geojson = corridorNetworkToGeoJson(network, {
        includeConnectors: false,
        scoreActivity: activityType,
      });

      sendJson(res, {
        ...geojson,
        _meta: {
          corridorCount: geojson.features.length,
          scoringTimeMs: Math.round(elapsed * 100) / 100,
        },
      });
    } catch (err) {
      sendJson(res, { error: String(err) }, 400);
    }
  });
}

function handleSave(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
      const { activityType, params } = JSON.parse(body) as {
        activityType: ActivityType;
        params: ScoringParams;
      };

      const source = readFileSync(SCORING_TS_PATH, "utf-8");

      const startMarker = "// @tuner-defaults-start";
      const endMarker = "// @tuner-defaults-end";
      const startIdx = source.indexOf(startMarker);
      const endIdx = source.indexOf(endMarker);

      if (startIdx === -1 || endIdx === -1) {
        sendJson(res, { error: "Could not find tuner-defaults markers in scoring.ts" }, 500);
        return;
      }

      // Parse the existing DEFAULT_SCORING_PARAMS from the marked block
      const before = source.slice(0, startIdx);
      const after = source.slice(endIdx + endMarker.length);
      const existingBlock = source.slice(
        startIdx + startMarker.length,
        endIdx,
      );

      // Extract the existing record by evaluating the structure
      // We'll rebuild the full record, updating only the specified activity
      const allActivities: ActivityType[] = ["road-cycling", "gravel-cycling", "running", "walking"];

      // Get current defaults for all activities
      const allParams: Record<string, ScoringParams> = {};
      for (const act of allActivities) {
        allParams[act] = getDefaultScoringParams(act);
      }
      // Override the one being saved
      allParams[activityType] = params;

      // Generate the new block
      const indent = "  ";
      const lines: string[] = [];
      lines.push(`${startMarker}`);
      lines.push(`const DEFAULT_SCORING_PARAMS: Record<ActivityType, ScoringParams> = {`);

      for (const act of allActivities) {
        const p = allParams[act]!;
        const key = act === "running" || act === "walking" ? act : `"${act}"`;
        lines.push(`${indent}${key}: {`);
        lines.push(`${indent}${indent}weights: { flow: ${p.weights.flow}, safety: ${p.weights.safety}, surface: ${p.weights.surface}, character: ${p.weights.character} },`);
        lines.push(`${indent}${indent}flow: { lengthLogDenominator: ${p.flow.lengthLogDenominator}, lengthLogNumerator: ${p.flow.lengthLogNumerator}, stopDecayRate: ${p.flow.stopDecayRate}, lengthBlend: ${p.flow.lengthBlend} },`);
        lines.push(`${indent}${indent}safety: { infrastructure: ${p.safety.infrastructure}, separation: ${p.safety.separation}, speedLimit: ${p.safety.speedLimit}, roadClass: ${p.safety.roadClass} },`);

        const surfaceEntries = Object.entries(p.surfaceScores).map(([k, v]) => `${k}: ${v}`).join(", ");
        lines.push(`${indent}${indent}surfaceScores: { ${surfaceEntries} },`);

        const charEntries = Object.entries(p.characterScores)
          .map(([k, v]) => {
            const qk = k.includes("-") ? `"${k}"` : k;
            return `${qk}: ${v}`;
          })
          .join(", ");
        lines.push(`${indent}${indent}characterScores: { ${charEntries} },`);

        lines.push(`${indent}${indent}surfaceConfidenceMinFactor: ${p.surfaceConfidenceMinFactor},`);
        lines.push(`${indent}},`);
      }

      lines.push(`};`);
      lines.push(`${endMarker}`);

      const newSource = before + lines.join("\n") + after;
      writeFileSync(SCORING_TS_PATH, newSource, "utf-8");

      console.log(`Saved ${activityType} defaults to scoring.ts`);
      sendJson(res, { saved: true, activityType });
    } catch (err) {
      sendJson(res, { error: String(err) }, 500);
    }
  });
}

function handleLoadLocation(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    if (loadingInProgress) {
      sendJson(res, { error: "A location load is already in progress" }, 409);
      return;
    }

    try {
      const { bbox } = JSON.parse(body) as {
        bbox: BoundingBox;
      };

      if (!bbox || bbox.minLat == null || bbox.maxLat == null || bbox.minLng == null || bbox.maxLng == null) {
        sendJson(res, { error: "Missing or invalid bbox" }, 400);
        return;
      }

      loadingInProgress = true;

      fetchAndMerge(bbox)
        .then((result) => {
          loadingInProgress = false;
          sendJson(res, result);
        })
        .catch((err) => {
          loadingInProgress = false;
          sendJson(res, { error: String(err) }, 500);
        });
    } catch (err) {
      sendJson(res, { error: String(err) }, 400);
    }
  });
}

function handleNetworkStats(_req: IncomingMessage, res: ServerResponse): void {
  // Compute bounding box and type breakdown
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  const typeBreakdown: Record<string, number> = {};

  for (const corridor of network.corridors.values()) {
    typeBreakdown[corridor.type] = (typeBreakdown[corridor.type] ?? 0) + 1;
    for (const coord of corridor.geometry) {
      if (coord.lat < minLat) minLat = coord.lat;
      if (coord.lat > maxLat) maxLat = coord.lat;
      if (coord.lng < minLng) minLng = coord.lng;
      if (coord.lng > maxLng) maxLng = coord.lng;
    }
  }

  sendJson(res, {
    corridorCount: network.corridors.size,
    connectorCount: network.connectors.size,
    typeBreakdown,
    bbox: { minLat, maxLat, minLng, maxLng },
    center: {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (url === "/" || url === "/index.html") {
    serveStatic(res, "index.html", "text/html; charset=utf-8");
  } else if (url.startsWith("/api/defaults")) {
    handleDefaults(req, res);
  } else if (url === "/api/score" && method === "POST") {
    handleScore(req, res);
  } else if (url === "/api/save" && method === "POST") {
    handleSave(req, res);
  } else if (url === "/api/network-stats") {
    handleNetworkStats(req, res);
  } else if (url === "/api/load-location" && method === "POST") {
    handleLoadLocation(req, res);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await loadData();

  server.listen(PORT, () => {
    console.log(`\nScoring Tuner running at http://localhost:${PORT}\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
