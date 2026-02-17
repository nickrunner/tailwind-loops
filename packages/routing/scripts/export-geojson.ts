/**
 * Ingest OSM data and export the graph as GeoJSON.
 *
 * Usage: npx tsx scripts/export-geojson.ts [output-path] [--cycleways] [--unpaved] [--dedup]
 *
 * Options:
 *   --cycleways   Export only cycleways and paths
 *   --unpaved     Export only unpaved/gravel/dirt surfaces
 *   --dedup       Deduplicate bidirectional edges
 *
 * Default output: ../../data/grand-rapids.geojson
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ingestOsm } from "@tailwind-loops/builder";
import { graphToGeoJson, type GeoJsonExportOptions } from "../src/export/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PBF_PATH = resolve(__dirname, "../../../data/grand-rapids.osm.pbf");

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));

const outputPath = positional[0] ?? resolve(__dirname, "../../../data/grand-rapids.geojson");

async function main() {
  console.log("Ingesting OSM data...");
  const result = await ingestOsm({ pbfPath: PBF_PATH });

  console.log(`Graph: ${result.stats.nodesCount.toLocaleString()} nodes, ${result.stats.edgesCount.toLocaleString()} edges`);

  // Build export options from flags
  const options: GeoJsonExportOptions = {
    deduplicateBidirectional: flags.includes("--dedup"),
  };

  if (flags.includes("--cycleways")) {
    options.roadClasses = ["cycleway", "path", "footway", "track"];
  }

  if (flags.includes("--unpaved")) {
    options.surfaceTypes = ["gravel", "dirt", "unpaved"];
  }

  console.log("Exporting to GeoJSON...");
  const geojson = graphToGeoJson(result.graph, options);

  console.log(`Features: ${geojson.features.length.toLocaleString()}`);

  const json = JSON.stringify(geojson);
  writeFileSync(outputPath, json);

  const sizeMb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
  console.log(`Written to: ${outputPath} (${sizeMb} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
