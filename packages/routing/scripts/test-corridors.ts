/**
 * Test corridor construction against Grand Rapids data.
 * Usage: npx tsx scripts/test-corridors.ts
 */
import { ingestOsm } from "../src/ingestion/index.js";
import { buildCorridors } from "../src/corridors/index.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PBF_PATH = resolve(__dirname, "../../../data/grand-rapids.osm.pbf");

async function main() {
  console.log("Ingesting Grand Rapids...");
  const { graph, stats: ingestStats } = await ingestOsm({ pbfPath: PBF_PATH });
  console.log(`Graph: ${ingestStats.nodesCount.toLocaleString()} nodes, ${ingestStats.edgesCount.toLocaleString()} edges`);
  console.log("");

  console.log("Building corridors...");
  const { network, stats } = await buildCorridors(graph);

  console.log("=== Corridor Network ===");
  console.log(`Corridors: ${stats.corridorCount.toLocaleString()}`);
  console.log(`Connectors: ${stats.connectorCount.toLocaleString()}`);
  console.log(`Avg corridor length: ${Math.round(stats.averageLengthMeters)}m`);
  console.log(`Total length: ${(stats.totalLengthMeters / 1000).toFixed(1)} km`);
  console.log(`Build time: ${stats.buildTimeMs}ms`);
  console.log("");

  // Type breakdown
  const typeCounts: Record<string, number> = {};
  const typeLengths: Record<string, number> = {};
  for (const c of network.corridors.values()) {
    typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1;
    typeLengths[c.type] = (typeLengths[c.type] ?? 0) + c.attributes.lengthMeters;
  }
  console.log("=== By Type ===");
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const km = ((typeLengths[type] ?? 0) / 1000).toFixed(1);
    console.log(`  ${type}: ${count} (${km} km)`);
  }
  console.log("");

  // Sample named corridors
  console.log("=== Sample Corridors (>1km, named) ===");
  const sorted = [...network.corridors.values()]
    .filter(c => c.name && c.attributes.lengthMeters > 1000)
    .sort((a, b) => b.attributes.lengthMeters - a.attributes.lengthMeters);
  for (const c of sorted.slice(0, 15)) {
    console.log(`  ${c.name} (${c.type})`);
    console.log(`    ${(c.attributes.lengthMeters / 1000).toFixed(1)}km | ${c.attributes.predominantSurface} | ${c.edgeIds.length} edges | infra: ${(c.attributes.infrastructureContinuity * 100).toFixed(0)}%`);
  }
  console.log("");

  // Adjacency stats
  let maxAdj = 0;
  let totalAdj = 0;
  for (const adj of network.adjacency.values()) {
    maxAdj = Math.max(maxAdj, adj.length);
    totalAdj += adj.length;
  }
  const avgAdj = totalAdj / network.adjacency.size;
  console.log("=== Adjacency ===");
  console.log(`Nodes in adjacency: ${network.adjacency.size}`);
  console.log(`Avg connections: ${avgAdj.toFixed(1)}`);
  console.log(`Max connections: ${maxAdj}`);
}

main().catch(e => { console.error(e); process.exit(1); });
