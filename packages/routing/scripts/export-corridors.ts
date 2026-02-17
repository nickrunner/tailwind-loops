/**
 * Export corridor network as color-coded GeoJSON.
 * Usage: npx tsx scripts/export-corridors.ts [--corridors-only] [--type trail,path]
 */
import { ingestOsm } from "../src/ingestion/index.js";
import { buildCorridors } from "../src/corridors/index.js";
import { corridorNetworkToGeoJson } from "../src/export/corridor-geojson.js";
import type { CorridorType } from "../src/domain/corridor.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PBF_PATH = resolve(__dirname, "../../../data/grand-rapids.osm.pbf");
const OUTPUT_DIR = resolve(__dirname, "../../../data");

const args = process.argv.slice(2);
const corridorsOnly = args.includes("--corridors-only");
const typeFilter = args.find((a) => a.startsWith("--type="));
const types = typeFilter
  ? (typeFilter.split("=")[1]!.split(",") as CorridorType[])
  : undefined;

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
  });

  const suffix = types ? `-${types.join("-")}` : "";
  const connSuffix = corridorsOnly ? "-corridors-only" : "";
  const outPath = resolve(
    OUTPUT_DIR,
    `grand-rapids-corridors${suffix}${connSuffix}.geojson`
  );

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
