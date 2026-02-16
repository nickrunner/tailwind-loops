/**
 * OSM PBF file parser.
 *
 * Wraps osm-pbf-parser-node to stream OSM elements from a PBF file,
 * filtering to only relevant highway types for routing.
 */

import { createOSMStream } from "osm-pbf-parser-node";
import type { OsmNode, OsmWay, OsmTags } from "./types.js";
import { isRelevantHighway } from "./types.js";

/**
 * Raw item from osm-pbf-parser-node.
 * The library's types are incomplete, so we define the shape here.
 */
interface RawOsmItem {
  type: "node" | "way" | "relation" | "header";
  id?: number;
  lat?: number;
  lon?: number;
  refs?: number[];
  tags?: Record<string, string>;
}

/**
 * Options for parsing OSM PBF files.
 */
export interface ParseOptions {
  /**
   * Filter to only ways with these activity types.
   * If not specified, includes all relevant highways.
   */
  activities?: ("cycling" | "running" | "walking")[];
}

/**
 * Parse an OSM PBF file and yield nodes and ways.
 *
 * This is a two-pass approach:
 * 1. First pass: identify all relevant ways and their referenced node IDs
 * 2. Second pass: yield nodes and ways
 *
 * We stream the file twice because PBF files have nodes before ways,
 * but we need to know which nodes are referenced by relevant ways.
 *
 * @param pbfPath - Path to the PBF file
 * @param options - Parsing options
 * @yields OsmNode and OsmWay elements
 */
export async function* parseOsmPbf(
  pbfPath: string,
  options: ParseOptions = {}
): AsyncGenerator<OsmNode | OsmWay> {
  // First pass: collect all referenced node IDs from relevant ways
  const referencedNodeIds = new Set<number>();
  const ways: OsmWay[] = [];

  for await (const rawItem of createOSMStream(pbfPath, { withTags: true })) {
    const item = rawItem as RawOsmItem;
    if (item.type === "way" && item.id !== undefined && item.refs) {
      const tags = item.tags as OsmTags | undefined;
      if (isRelevantWay(tags, options)) {
        const way: OsmWay = {
          type: "way",
          id: item.id,
          refs: item.refs,
          tags,
        };
        ways.push(way);

        // Mark all nodes in this way as referenced
        for (const nodeId of way.refs) {
          referencedNodeIds.add(nodeId);
        }
      }
    }
  }

  // Second pass: yield referenced nodes, then ways
  for await (const rawItem of createOSMStream(pbfPath, { withTags: true })) {
    const item = rawItem as RawOsmItem;
    if (item.type === "node" && item.id !== undefined) {
      const nodeId = item.id;
      if (referencedNodeIds.has(nodeId) && item.lat !== undefined && item.lon !== undefined) {
        yield {
          type: "node",
          id: nodeId,
          lat: item.lat,
          lon: item.lon,
          tags: item.tags as OsmTags | undefined,
        };
      }
    }
  }

  // Yield all collected ways
  for (const way of ways) {
    yield way;
  }
}

/**
 * Check if a way is relevant for routing based on its tags.
 */
function isRelevantWay(tags: OsmTags | undefined, options: ParseOptions): boolean {
  if (!tags) return false;

  const highway = tags["highway"];
  if (!isRelevantHighway(highway)) return false;

  // If no activity filter, accept all relevant highways
  if (!options.activities || options.activities.length === 0) {
    return true;
  }

  // Filter by activity type
  // This is a simplified filter - could be made more sophisticated
  const activities = options.activities;

  // Footway and steps are walking-only unless explicitly marked for bikes
  if (highway === "footway" || highway === "steps") {
    if (!activities.includes("walking")) {
      // Check if bikes are explicitly allowed
      const bicycle = tags["bicycle"];
      if (bicycle !== "yes" && bicycle !== "designated") {
        if (!activities.includes("cycling")) {
          return activities.includes("running");
        }
      }
    }
    return true;
  }

  // Cycleways are primarily for cycling but usually allow walking
  if (highway === "cycleway") {
    return (
      activities.includes("cycling") ||
      activities.includes("walking") ||
      activities.includes("running")
    );
  }

  // All other relevant highways are suitable for all activities
  return true;
}

/**
 * Count elements in a PBF file without building the full graph.
 * Useful for progress reporting.
 */
export async function countPbfElements(
  pbfPath: string
): Promise<{ nodes: number; ways: number; relations: number }> {
  let nodes = 0;
  let ways = 0;
  let relations = 0;

  for await (const rawItem of createOSMStream(pbfPath)) {
    const item = rawItem as RawOsmItem;
    switch (item.type) {
      case "node":
        nodes++;
        break;
      case "way":
        ways++;
        break;
      case "relation":
        relations++;
        break;
    }
  }

  return { nodes, ways, relations };
}
