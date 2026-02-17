/**
 * Export corridor network as color-coded GeoJSON.
 * Usage: npx tsx scripts/export-corridors.ts [--corridors-only] [--type trail,path] [--activity road-cycling|gravel-cycling|running|walking] [--score=road-cycling|gravel-cycling|running|walking]
 */
import { ingestOsm } from "../src/ingestion/index.js";
import { buildCorridors } from "../src/corridors/index.js";
import { corridorNetworkToGeoJson } from "../src/export/corridor-geojson.js";
import type { CorridorType } from "../src/domain/corridor.js";
import type { ActivityType } from "../src/domain/intent.js";
import { CORRIDOR_TYPES_BY_ACTIVITY } from "../src/domain/intent.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PBF_PATH = resolve(__dirname, "../../../data/grand-rapids.osm.pbf");
const DATA_DIR = resolve(__dirname, "../../../data");

const args = process.argv.slice(2);
const corridorsOnly = args.includes("--corridors-only");

function getArgValue(flag: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith(`--${flag}=`)) {
      return args[i].split("=")[1];
    }
    if (args[i] === `--${flag}` && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      return args[i + 1];
    }
  }
  return undefined;
}

const scoreActivity = getArgValue("score") as ActivityType | undefined;
const activity = getArgValue("activity") as ActivityType | undefined;

// --activity takes precedence over --type
const typeFilterValue = getArgValue("type");
const types = activity
  ? CORRIDOR_TYPES_BY_ACTIVITY[activity]
  : typeFilterValue
    ? (typeFilterValue.split(",") as CorridorType[])
    : undefined;

function getOutputDir(): string {
  const label = activity ?? (types ? types.join("-") : null);
  const scoreSuffix = scoreActivity ? `-scored-${scoreActivity}` : "";
  if (label && corridorsOnly) {
    return resolve(DATA_DIR, `corridors-${label}-only${scoreSuffix}`);
  } else if (label) {
    return resolve(DATA_DIR, `corridors-${label}${scoreSuffix}`);
  } else if (corridorsOnly) {
    return resolve(DATA_DIR, `corridors-only${scoreSuffix}`);
  } else {
    return resolve(DATA_DIR, `corridors-all${scoreSuffix}`);
  }
}

async function main() {
  console.log("Ingesting Grand Rapids...");
  const { graph, stats: ingestStats } = await ingestOsm({ pbfPath: PBF_PATH });
  console.log(
    `Graph: ${ingestStats.nodesCount.toLocaleString()} nodes, ${ingestStats.edgesCount.toLocaleString()} edges`
  );

  console.log("Building corridors...");
  const { network, stats } = await buildCorridors(graph);
  console.log(
    `${stats.corridorCount.toLocaleString()} corridors, ${stats.connectorCount.toLocaleString()} connectors`
  );

  console.log("Exporting GeoJSON...");
  const geojson = corridorNetworkToGeoJson(network, {
    includeConnectors: !corridorsOnly,
    corridorTypes: types,
    scoreActivity,
  });

  const outputDir = getOutputDir();
  mkdirSync(outputDir, { recursive: true });
  const outPath = resolve(outputDir, "grand-rapids-corridors.geojson");

  writeFileSync(outPath, JSON.stringify(geojson));
  console.log(
    `Wrote ${geojson.features.length.toLocaleString()} features to ${outPath}`
  );
  console.log(
    `File size: ${(Buffer.byteLength(JSON.stringify(geojson)) / 1024 / 1024).toFixed(1)} MB`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
