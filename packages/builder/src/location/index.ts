/**
 * Location-based corridor building.
 *
 * High-level API that takes a coordinate + radius and returns a
 * CorridorNetwork for that area. Handles the full pipeline:
 * bbox computation → Overpass query → graph building → corridor extraction.
 */

import type { Coordinate, BoundingBox } from "@tailwind-loops/types";
import type { CorridorBuildResult, CorridorBuilderOptions } from "../corridors/index.js";
import { buildCorridors } from "../corridors/index.js";
import { ingestFromOverpass } from "../ingestion/index.js";
import type { OverpassOptions } from "../ingestion/overpass/index.js";

/** Options for location-based corridor building */
export interface LocationBuildOptions {
  /** Overpass API options */
  overpass?: OverpassOptions;
  /** Corridor builder options */
  corridors?: CorridorBuilderOptions;
  /** Buffer in km added around the query bbox (default: 2) */
  bufferKm?: number;
}

const DEFAULT_BUFFER_KM = 2;

// Earth's radius in km
const EARTH_RADIUS_KM = 6371;

/**
 * Build a CorridorNetwork for a location.
 *
 * Pipeline:
 * 1. Compute bbox from center + radius + buffer
 * 2. Query Overpass API for the buffered bbox
 * 3. Build graph from Overpass response
 * 4. Build corridors from graph
 * 5. Filter corridors to those intersecting the core (unbuffered) bbox
 *
 * The buffer ensures corridors near the edges aren't truncated or missing.
 *
 * @param center - Center coordinate
 * @param radiusKm - Radius in kilometers
 * @param options - Build options
 * @returns Corridor network and statistics
 */
export async function buildCorridorsForLocation(
  center: Coordinate,
  radiusKm: number,
  options?: LocationBuildOptions
): Promise<CorridorBuildResult> {
  const bufferKm = options?.bufferKm ?? DEFAULT_BUFFER_KM;

  // Compute bboxes
  const coreBbox = bboxFromCenter(center, radiusKm);
  const bufferedBbox = expandBbox(coreBbox, bufferKm);

  // Ingest from Overpass
  const { graph } = await ingestFromOverpass(bufferedBbox, options?.overpass);

  // Build corridors from the full buffered graph
  const result = await buildCorridors(graph, options?.corridors);

  // Filter corridors to those that intersect the core bbox.
  // This removes corridors that exist only in the buffer zone.
  const { network } = result;
  for (const [id, corridor] of network.corridors) {
    if (!geometryIntersectsBbox(corridor.geometry, coreBbox)) {
      network.corridors.delete(id);
      network.adjacency.delete(id);
    }
  }

  // Remove connectors that no longer connect to any remaining corridor
  for (const [id, connector] of network.connectors) {
    const livingCorridors = connector.corridorIds.filter((cid) =>
      network.corridors.has(cid)
    );
    if (livingCorridors.length === 0) {
      network.connectors.delete(id);
      network.adjacency.delete(id);
    } else {
      connector.corridorIds = livingCorridors;
    }
  }

  // Clean up adjacency references to deleted entities
  for (const [id, adjList] of network.adjacency) {
    network.adjacency.set(
      id,
      adjList.filter(
        (aid) => network.corridors.has(aid) || network.connectors.has(aid)
      )
    );
  }

  // Recompute stats
  let totalLength = 0;
  for (const c of network.corridors.values()) {
    totalLength += c.attributes.lengthMeters;
  }

  return {
    network,
    stats: {
      corridorCount: network.corridors.size,
      connectorCount: network.connectors.size,
      averageLengthMeters:
        network.corridors.size > 0 ? totalLength / network.corridors.size : 0,
      totalLengthMeters: totalLength,
      buildTimeMs: result.stats.buildTimeMs,
    },
  };
}

/**
 * Compute a bounding box from a center coordinate and radius.
 *
 * Uses a spherical approximation (good enough for routing-scale distances).
 *
 * @param center - Center coordinate
 * @param radiusKm - Radius in kilometers
 * @returns Bounding box
 */
export function bboxFromCenter(
  center: Coordinate,
  radiusKm: number
): BoundingBox {
  // Latitude: 1 degree ≈ 111.32 km
  const latDelta = radiusKm / 111.32;

  // Longitude: varies with latitude
  const lngDelta =
    radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/**
 * Expand a bounding box by a buffer distance in kilometers.
 *
 * @param bbox - Original bounding box
 * @param bufferKm - Buffer distance in km
 * @returns Expanded bounding box
 */
export function expandBbox(bbox: BoundingBox, bufferKm: number): BoundingBox {
  const latBuffer = bufferKm / 111.32;

  // Use the center latitude for longitude scaling
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const lngBuffer =
    bufferKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));

  return {
    minLat: bbox.minLat - latBuffer,
    maxLat: bbox.maxLat + latBuffer,
    minLng: bbox.minLng - lngBuffer,
    maxLng: bbox.maxLng + lngBuffer,
  };
}

/**
 * Check if any point in a geometry falls within a bounding box.
 */
function geometryIntersectsBbox(
  geometry: Coordinate[],
  bbox: BoundingBox
): boolean {
  return geometry.some(
    (coord) =>
      coord.lat >= bbox.minLat &&
      coord.lat <= bbox.maxLat &&
      coord.lng >= bbox.minLng &&
      coord.lng <= bbox.maxLng
  );
}
