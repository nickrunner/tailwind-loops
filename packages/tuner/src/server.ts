/**
 * Scoring Tuner — local dev server.
 *
 * Ingests OSM + builds corridors once at startup, then serves a web UI
 * that lets you tweak scoring parameters and see the results on a map
 * in real time.
 *
 * Usage: pnpm start
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ingestOsm, buildCorridors } from "@tailwind-loops/builder";
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

// ---------------------------------------------------------------------------
// Data loading (runs once at startup)
// ---------------------------------------------------------------------------

let network: CorridorNetwork;

async function loadData(): Promise<void> {
  console.log("Ingesting Grand Rapids OSM data...");
  const { graph, stats: ingestStats } = await ingestOsm({ pbfPath: PBF_PATH });
  console.log(
    `  Graph: ${ingestStats.nodesCount.toLocaleString()} nodes, ${ingestStats.edgesCount.toLocaleString()} edges`,
  );

  console.log("Building corridors...");
  const { network: net, stats } = await buildCorridors(graph);
  network = net;
  console.log(
    `  ${stats.corridorCount.toLocaleString()} corridors, ${stats.connectorCount.toLocaleString()} connectors`,
  );
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
