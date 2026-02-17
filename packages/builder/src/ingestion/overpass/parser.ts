/**
 * Overpass JSON response parser.
 *
 * Converts Overpass API response elements into our OsmNode/OsmWay types,
 * which are then consumed by the existing buildGraphFromOsm() pipeline.
 *
 * With `out body geom;`, Overpass returns:
 * - Ways with `nodes[]` (OSM node IDs) and `geometry[]` (inline lat/lon)
 * - Nodes with `lat`/`lon` and `tags`
 *
 * The geometry[] and nodes[] arrays on ways are parallel — geometry[i]
 * corresponds to nodes[i]. This lets us create OsmNode objects without
 * a separate node query.
 */

import type { OverpassJson, OverpassNode, OverpassWay } from "overpass-ts";
import type { OsmNode, OsmWay } from "../osm/types.js";
import { isRelevantHighway } from "../osm/types.js";

/**
 * Parse an Overpass JSON response into OsmNode and OsmWay elements.
 *
 * Yields elements compatible with buildGraphFromOsm():
 * 1. OsmNodes from explicit node elements (traffic signals, stops, crossings)
 * 2. OsmNodes synthesized from way geometry (for coordinate lookup)
 * 3. OsmWays with refs pointing to node IDs
 *
 * @param response - Overpass JSON response from fetchOverpassData()
 */
export async function* parseOverpassResponse(
  response: OverpassJson
): AsyncGenerator<OsmNode | OsmWay> {
  // Track nodes we've already yielded to avoid duplicates
  const yieldedNodeIds = new Set<number>();

  // First pass: yield explicit node elements (traffic_signals, stop, crossing)
  for (const element of response.elements) {
    if (element.type === "node") {
      const node = element as OverpassNode;
      const osmNode: OsmNode = {
        type: "node",
        id: node.id,
        lat: node.lat,
        lon: node.lon,
        tags: node.tags,
      };
      yield osmNode;
      yieldedNodeIds.add(node.id);
    }
  }

  // Second pass: process ways — synthesize nodes from geometry, then yield ways
  for (const element of response.elements) {
    if (element.type !== "way") continue;
    const way = element as OverpassWay;

    // Skip ways without a relevant highway tag (shouldn't happen since the
    // query filters server-side, but defensive)
    if (!isRelevantHighway(way.tags?.["highway"])) continue;

    // Synthesize OsmNode entries from the way's inline geometry.
    // With `out body geom;`, way.geometry[i] is the coordinate for way.nodes[i].
    if (way.geometry && way.nodes) {
      for (let i = 0; i < way.nodes.length; i++) {
        const nodeId = way.nodes[i]!;
        if (yieldedNodeIds.has(nodeId)) continue;

        const geom = way.geometry[i];
        if (!geom) continue; // node outside bbox (rare with geom output)

        const osmNode: OsmNode = {
          type: "node",
          id: nodeId,
          lat: geom.lat,
          lon: geom.lon,
          // No tags — geometry-only nodes don't have tags.
          // Nodes with tags (signals, stops) were already yielded above.
        };
        yield osmNode;
        yieldedNodeIds.add(nodeId);
      }
    }

    // Yield the way
    const osmWay: OsmWay = {
      type: "way",
      id: way.id,
      refs: way.nodes,
      tags: way.tags,
    };
    yield osmWay;
  }
}
