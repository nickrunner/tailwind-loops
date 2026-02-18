/**
 * Corridor attribute coverage report.
 *
 * Runs the full ingestion + corridor building pipeline and reports
 * average values and occurrence frequency for every attribute to
 * identify data gaps.
 *
 * Usage: npx tsx scripts/attribute-report.ts <path-to.osm.pbf>
 *
 * Saves a text report next to the PBF file as attribute-report.txt.
 */
import { ingestOsm } from "../src/ingestion/index.js";
import { buildCorridors } from "../src/corridors/index.js";
import { resolve, dirname, basename } from "path";
import { writeFileSync } from "fs";
import type {
  Graph,
  CorridorNetwork,
  CorridorAttributes,
} from "@tailwind-loops/types";

// ── CLI ──────────────────────────────────────────────────────────────

const pbfPath = process.argv[2];
if (!pbfPath) {
  console.error("Usage: npx tsx scripts/attribute-report.ts <path-to.osm.pbf>");
  process.exit(1);
}
const resolvedPbf = resolve(pbfPath);

// ── Output capture ───────────────────────────────────────────────────

const lines: string[] = [];

function log(msg = "") {
  console.log(msg);
  lines.push(msg);
}

// ── Helpers ──────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

function km(meters: number): string {
  return (meters / 1000).toFixed(1);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function pad(s: string, width: number): string {
  return s.padEnd(width);
}

function padLeft(s: string, width: number): string {
  return s.padStart(width);
}

function row(label: string, countStr: string, pctByCount: string, kmStr: string, pctByKm: string): string {
  return `  ${pad(label, 36)} ${padLeft(countStr, 8)} ${padLeft(pctByCount, 8)} ${padLeft(kmStr, 10)} ${padLeft(pctByKm, 8)}`;
}

function statRow(label: string, ...cols: string[]): string {
  return `  ${pad(label, 36)} ${cols.map(c => padLeft(c, 12)).join("")}`;
}

// ── Section 1: Edge-Level Data Availability ──────────────────────────

function reportEdgeAttributes(graph: Graph) {
  const edges = [...graph.edges.values()];
  const total = edges.length;
  const totalKm = edges.reduce((s, e) => s + e.attributes.lengthMeters, 0) / 1000;

  let explicitSurface = 0;
  let explicitSurfaceKm = 0;
  let hasSpeedLimit = 0;
  let hasSpeedLimitKm = 0;
  let hasLanes = 0;
  let hasLanesKm = 0;
  let hasName = 0;
  let hasNameKm = 0;
  let hasScenic = 0;
  let hasScenicKm = 0;
  let hasStops = 0;
  let hasStopsKm = 0;
  let hasSignals = 0;
  let hasSignalsKm = 0;
  let hasCrossings = 0;
  let hasCrossingsKm = 0;
  let hasBikeInfra = 0;
  let hasBikeInfraKm = 0;
  let hasPedPath = 0;
  let hasPedPathKm = 0;
  let hasShoulder = 0;
  let hasShoulderKm = 0;
  let isSeparated = 0;
  let isSeparatedKm = 0;
  let hasCalming = 0;
  let hasCalmingKm = 0;

  for (const edge of edges) {
    const a = edge.attributes;
    const len = a.lengthMeters / 1000;

    const hasExplicit = a.surfaceClassification.observations.some(
      o => o.source === "osm-surface-tag"
    );
    if (hasExplicit) { explicitSurface++; explicitSurfaceKm += len; }

    if (a.speedLimit !== undefined) { hasSpeedLimit++; hasSpeedLimitKm += len; }
    if (a.lanes !== undefined) { hasLanes++; hasLanesKm += len; }
    if (a.name !== undefined) { hasName++; hasNameKm += len; }
    if (a.scenicDesignation === true) { hasScenic++; hasScenicKm += len; }
    if ((a.stopSignCount ?? 0) > 0) { hasStops++; hasStopsKm += len; }
    if ((a.trafficSignalCount ?? 0) > 0) { hasSignals++; hasSignalsKm += len; }
    if ((a.roadCrossingCount ?? 0) > 0) { hasCrossings++; hasCrossingsKm += len; }
    if (a.infrastructure.hasBicycleInfra) { hasBikeInfra++; hasBikeInfraKm += len; }
    if (a.infrastructure.hasPedestrianPath) { hasPedPath++; hasPedPathKm += len; }
    if (a.infrastructure.hasShoulder) { hasShoulder++; hasShoulderKm += len; }
    if (a.infrastructure.isSeparated) { isSeparated++; isSeparatedKm += len; }
    if (a.infrastructure.hasTrafficCalming) { hasCalming++; hasCalmingKm += len; }
  }

  log("╔══════════════════════════════════════════════════════════════════════════════════╗");
  log("║  SECTION 1: Edge-Level Data Availability                                       ║");
  log("╚══════════════════════════════════════════════════════════════════════════════════╝");
  log(`  Total edges: ${total.toLocaleString()}  |  Total distance: ${km(totalKm * 1000)} km`);
  log("");
  log(row("Attribute", "Count", "% Edges", "km", "% km"));
  log("  " + "─".repeat(72));

  const items: [string, number, number][] = [
    ["Explicit surface tag", explicitSurface, explicitSurfaceKm],
    ["Speed limit defined", hasSpeedLimit, hasSpeedLimitKm],
    ["Lanes defined", hasLanes, hasLanesKm],
    ["Name defined", hasName, hasNameKm],
    ["Scenic designation", hasScenic, hasScenicKm],
    ["Stop signs (>0)", hasStops, hasStopsKm],
    ["Traffic signals (>0)", hasSignals, hasSignalsKm],
    ["Road crossings (>0)", hasCrossings, hasCrossingsKm],
    ["Bicycle infrastructure", hasBikeInfra, hasBikeInfraKm],
    ["Pedestrian path", hasPedPath, hasPedPathKm],
    ["Shoulder present", hasShoulder, hasShoulderKm],
    ["Separated from traffic", isSeparated, isSeparatedKm],
    ["Traffic calming", hasCalming, hasCalmingKm],
  ];

  for (const [label, count, kmVal] of items) {
    log(row(label, count.toLocaleString(), pct(count, total), km(kmVal * 1000), pct(kmVal, totalKm)));
  }

  // Surface type distribution
  log("");
  log("  Surface type distribution:");
  const surfaceCounts: Record<string, { count: number; km: number }> = {};
  for (const edge of edges) {
    const s = edge.attributes.surfaceClassification.surface;
    if (!surfaceCounts[s]) surfaceCounts[s] = { count: 0, km: 0 };
    surfaceCounts[s].count++;
    surfaceCounts[s].km += edge.attributes.lengthMeters / 1000;
  }
  for (const [s, v] of Object.entries(surfaceCounts).sort((a, b) => b[1].count - a[1].count)) {
    log(`    ${pad(s, 16)} ${padLeft(v.count.toLocaleString(), 8)} edges  ${padLeft(km(v.km * 1000), 8)} km  (${pct(v.count, total)})`);
  }

  // Road class distribution
  log("");
  log("  Road class distribution:");
  const classCounts: Record<string, { count: number; km: number }> = {};
  for (const edge of edges) {
    const rc = edge.attributes.roadClass;
    if (!classCounts[rc]) classCounts[rc] = { count: 0, km: 0 };
    classCounts[rc].count++;
    classCounts[rc].km += edge.attributes.lengthMeters / 1000;
  }
  for (const [rc, v] of Object.entries(classCounts).sort((a, b) => b[1].count - a[1].count)) {
    log(`    ${pad(rc, 16)} ${padLeft(v.count.toLocaleString(), 8)} edges  ${padLeft(km(v.km * 1000), 8)} km  (${pct(v.count, total)})`);
  }

  log("");
}

// ── Section 2: Corridor-Level Attribute Statistics ───────────────────

function reportCorridorAttributes(network: CorridorNetwork) {
  const corridors = [...network.corridors.values()];
  const total = corridors.length;

  log("╔══════════════════════════════════════════════════════════════════════════════════╗");
  log("║  SECTION 2: Corridor-Level Attribute Statistics                                 ║");
  log("╚══════════════════════════════════════════════════════════════════════════════════╝");
  log(`  Total corridors: ${total.toLocaleString()}`);
  log("");

  // Length stats
  const lengths = corridors.map(c => c.attributes.lengthMeters).sort((a, b) => a - b);
  const avgLen = lengths.reduce((s, v) => s + v, 0) / total;
  log(statRow("", "Avg", "Min", "Max", "P50"));
  log("  " + "─".repeat(84));
  log(statRow(
    "Length (m)",
    Math.round(avgLen).toLocaleString(),
    Math.round(lengths[0]).toLocaleString(),
    Math.round(lengths[lengths.length - 1]).toLocaleString(),
    Math.round(percentile(lengths, 0.5)).toLocaleString(),
  ));

  // Surface confidence
  const confs = corridors.map(c => c.attributes.surfaceConfidence).sort((a, b) => a - b);
  const avgConf = confs.reduce((s, v) => s + v, 0) / total;
  const lowConf = confs.filter(c => c < 0.3).length;
  log(statRow(
    "Surface confidence",
    avgConf.toFixed(2),
    confs[0].toFixed(2),
    confs[confs.length - 1].toFixed(2),
    percentile(confs, 0.5).toFixed(2),
  ));
  log(`    ${padLeft("", 36)} Low confidence (<0.3): ${lowConf} corridors (${pct(lowConf, total)})`);

  // Turns
  const turns = corridors.map(c => c.attributes.turnsCount).sort((a, b) => a - b);
  const avgTurns = turns.reduce((s, v) => s + v, 0) / total;
  log(statRow(
    "Turns count",
    avgTurns.toFixed(1),
    turns[0].toString(),
    turns[turns.length - 1].toString(),
    percentile(turns, 0.5).toString(),
  ));

  log("");
  log(statRow("", "Avg", "> 0 Count", "> 0 %", ""));
  log("  " + "─".repeat(84));

  // Continuity / fraction fields
  const continuityFields: [string, (c: CorridorAttributes) => number][] = [
    ["Bicycle infra continuity", a => a.bicycleInfraContinuity],
    ["Pedestrian path continuity", a => a.pedestrianPathContinuity],
    ["Separation continuity", a => a.separationContinuity],
    ["Traffic calming continuity", a => a.trafficCalmingContinuity],
    ["Scenic score", a => a.scenicScore],
    ["Stop density (/km)", a => a.stopDensityPerKm],
    ["Crossing density (/km)", a => a.crossingDensityPerKm],
  ];

  for (const [label, getter] of continuityFields) {
    const vals = corridors.map(c => getter(c.attributes));
    const finite = vals.filter(v => Number.isFinite(v));
    const avg = finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : 0;
    const nonZero = finite.filter(v => v > 0).length;
    log(statRow(label, avg.toFixed(3), nonZero.toLocaleString(), pct(nonZero, total), ""));
  }

  // Speed limit
  const withSpeed = corridors.filter(c => c.attributes.averageSpeedLimit !== undefined);
  const avgSpeed = withSpeed.length > 0
    ? withSpeed.reduce((s, c) => s + c.attributes.averageSpeedLimit!, 0) / withSpeed.length
    : 0;
  log(statRow(
    "Avg speed limit (km/h)",
    avgSpeed.toFixed(1),
    withSpeed.length.toLocaleString(),
    pct(withSpeed.length, total),
    "",
  ));

  // Road class distribution
  log("");
  log("  Predominant road class distribution:");
  const classDist: Record<string, { count: number; km: number }> = {};
  for (const c of corridors) {
    const rc = c.attributes.predominantRoadClass;
    if (!classDist[rc]) classDist[rc] = { count: 0, km: 0 };
    classDist[rc].count++;
    classDist[rc].km += c.attributes.lengthMeters / 1000;
  }
  for (const [rc, v] of Object.entries(classDist).sort((a, b) => b[1].count - a[1].count)) {
    log(`    ${pad(rc, 16)} ${padLeft(v.count.toLocaleString(), 6)} corridors  ${padLeft(km(v.km * 1000), 8)} km  (${pct(v.count, total)})`);
  }

  // Surface distribution
  log("");
  log("  Predominant surface distribution:");
  const surfDist: Record<string, { count: number; km: number }> = {};
  for (const c of corridors) {
    const s = c.attributes.predominantSurface;
    if (!surfDist[s]) surfDist[s] = { count: 0, km: 0 };
    surfDist[s].count++;
    surfDist[s].km += c.attributes.lengthMeters / 1000;
  }
  for (const [s, v] of Object.entries(surfDist).sort((a, b) => b[1].count - a[1].count)) {
    log(`    ${pad(s, 16)} ${padLeft(v.count.toLocaleString(), 6)} corridors  ${padLeft(km(v.km * 1000), 8)} km  (${pct(v.count, total)})`);
  }

  log("");
}

// ── Section 3: Connector-Level Summary ──────────────────────────────

function reportConnectorAttributes(network: CorridorNetwork) {
  const connectors = [...network.connectors.values()];
  const total = connectors.length;

  log("╔══════════════════════════════════════════════════════════════════════════════════╗");
  log("║  SECTION 3: Connector-Level Summary                                            ║");
  log("╚══════════════════════════════════════════════════════════════════════════════════╝");
  log(`  Total connectors: ${total.toLocaleString()}`);
  log("");

  if (total === 0) {
    log("  No connectors found.");
    return;
  }

  const lengths = connectors.map(c => c.attributes.lengthMeters).sort((a, b) => a - b);
  const avgLen = lengths.reduce((s, v) => s + v, 0) / total;

  const withSignal = connectors.filter(c => c.attributes.hasSignal).length;
  const withStop = connectors.filter(c => c.attributes.hasStop).length;
  const crossesMajor = connectors.filter(c => c.attributes.crossesMajorRoad).length;

  const difficulties = connectors.map(c => c.attributes.crossingDifficulty);
  const avgDiff = difficulties.reduce((s, v) => s + v, 0) / total;

  log(`  Avg length:              ${Math.round(avgLen)} m`);
  log(`  Min / Max length:        ${Math.round(lengths[0])} m / ${Math.round(lengths[lengths.length - 1])} m`);
  log(`  With signal:             ${withSignal.toLocaleString()} (${pct(withSignal, total)})`);
  log(`  With stop:               ${withStop.toLocaleString()} (${pct(withStop, total)})`);
  log(`  Crosses major road:      ${crossesMajor.toLocaleString()} (${pct(crossesMajor, total)})`);
  log(`  Avg crossing difficulty: ${avgDiff.toFixed(3)}`);
  log("");
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const pbfName = basename(resolvedPbf, ".osm.pbf");
  log(`Attribute coverage report for: ${pbfName}`);
  log(`PBF: ${resolvedPbf}`);
  log(`Generated: ${new Date().toISOString()}`);
  log("");

  log("Ingesting OSM data...");
  const { graph, stats: ingestStats } = await ingestOsm({ pbfPath: resolvedPbf });
  log(`Graph: ${ingestStats.nodesCount.toLocaleString()} nodes, ${ingestStats.edgesCount.toLocaleString()} edges, ${km(ingestStats.totalLengthMeters)} km`);
  log(`Ingestion time: ${ingestStats.ingestionTimeMs} ms`);
  log("");

  log("Building corridors...");
  const { network, stats: buildStats } = await buildCorridors(graph);
  log(`Corridors: ${buildStats.corridorCount.toLocaleString()}, Connectors: ${buildStats.connectorCount.toLocaleString()}`);
  log(`Build time: ${buildStats.buildTimeMs} ms`);
  log("");

  reportEdgeAttributes(graph);
  reportCorridorAttributes(network);
  reportConnectorAttributes(network);

  log("Report complete.");

  // Save report next to the PBF file
  const reportPath = resolve(dirname(resolvedPbf), "attribute-report.txt");
  writeFileSync(reportPath, lines.join("\n") + "\n");
  console.log(`\nSaved to: ${reportPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
