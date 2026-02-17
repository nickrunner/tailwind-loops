/**
 * Test script to run OSM ingestion on the Michigan PBF file.
 *
 * Usage: npx tsx scripts/test-ingest.ts
 */

import { ingestOsm } from "@tailwind-loops/builder";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PBF_PATH = resolve(__dirname, "../../../data/grand-rapids.osm.pbf");

async function main() {
  console.log("Starting OSM ingestion...");
  console.log(`PBF file: ${PBF_PATH}`);
  console.log("");

  const startTime = Date.now();

  try {
    const result = await ingestOsm({ pbfPath: PBF_PATH });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("=== Ingestion Complete ===");
    console.log(`Time: ${elapsed}s`);
    console.log("");
    console.log("=== Graph Statistics ===");
    console.log(`Nodes: ${result.stats.nodesCount.toLocaleString()}`);
    console.log(`Edges: ${result.stats.edgesCount.toLocaleString()}`);
    console.log(`Total length: ${(result.stats.totalLengthMeters / 1000).toFixed(1)} km`);
    console.log("");
    console.log("=== Surface Statistics ===");
    console.log(`High confidence (>0.7): ${result.stats.surface.highConfidenceCount.toLocaleString()}`);
    console.log(`Medium confidence (0.4-0.7): ${result.stats.surface.mediumConfidenceCount.toLocaleString()}`);
    console.log(`Low confidence (<0.4): ${result.stats.surface.lowConfidenceCount.toLocaleString()}`);
    console.log(`Conflicts: ${result.stats.surface.conflictCount.toLocaleString()}`);
    console.log("");
    console.log("=== Surface Types ===");
    for (const [surfaceType, count] of Object.entries(result.stats.surface.bySurfaceType)) {
      if (count > 0) {
        console.log(`  ${surfaceType}: ${count.toLocaleString()}`);
      }
    }

    // Sample a few edges to show what the data looks like
    console.log("");
    console.log("=== Sample Edges ===");
    let sampleCount = 0;
    for (const edge of result.graph.edges.values()) {
      if (sampleCount >= 5) break;
      if (edge.attributes.name) {
        console.log(`  ${edge.attributes.name}`);
        console.log(`    Road class: ${edge.attributes.roadClass}`);
        console.log(`    Surface: ${edge.attributes.surfaceClassification.surface} (confidence: ${edge.attributes.surfaceClassification.confidence.toFixed(2)})`);
        console.log(`    Length: ${edge.attributes.lengthMeters.toFixed(0)}m`);
        sampleCount++;
      }
    }
  } catch (error) {
    console.error("Ingestion failed:", error);
    process.exit(1);
  }
}

main();
