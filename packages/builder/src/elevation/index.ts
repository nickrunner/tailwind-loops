/**
 * Elevation enrichment pipeline step.
 *
 * Adds DEM-based elevation data to graph nodes and computes elevation
 * metrics (gain, loss, grade) for edges. This is a separate pipeline step
 * (not an enrichment provider) because elevation is a per-coordinate lookup
 * from a single authoritative source, not multi-source observations.
 *
 * Usage:
 * ```ts
 * const stats = enrichElevation(graph, { dem: { tilesDir: "./srtm" } });
 * ```
 */

import type { Graph } from "@tailwind-loops/types";
import { DemReader, type DemConfig } from "./hgt-reader.js";
import { haversineDistance } from "../ingestion/osm/index.js";

export type { DemConfig } from "./hgt-reader.js";
export { DemReader } from "./hgt-reader.js";

/** Options for elevation enrichment */
export interface ElevationEnrichmentOptions {
  dem: DemConfig;
}

/** Statistics returned after elevation enrichment */
export interface ElevationStats {
  nodesEnriched: number;
  nodesMissing: number;
  edgesEnriched: number;
  timeMs: number;
}

/**
 * Enrich a graph with elevation data from DEM tiles.
 *
 * 1. For each node: look up elevation from DEM, set `node.elevationMeters`
 * 2. For each edge: compute elevation metrics from geometry point elevations
 *
 * Mutates the graph in place.
 */
export function enrichElevation(
  graph: Graph,
  options: ElevationEnrichmentOptions,
): ElevationStats {
  const startTime = Date.now();
  const dem = new DemReader(options.dem);

  let nodesEnriched = 0;
  let nodesMissing = 0;

  // Step 1: Enrich nodes
  for (const node of graph.nodes.values()) {
    const elev = dem.getElevation(node.coordinate.lat, node.coordinate.lng);
    if (elev != null) {
      node.elevationMeters = elev;
      nodesEnriched++;
    } else {
      nodesMissing++;
    }
  }

  // Step 2: Enrich edges
  let edgesEnriched = 0;

  for (const edge of graph.edges.values()) {
    const geom = edge.geometry;
    if (geom.length < 2) continue;

    // Get elevations for all geometry points
    const elevations = dem.getElevations(geom);

    // Check if we have enough valid elevations
    const validCount = elevations.filter((e) => e != null).length;
    if (validCount < 2) continue;

    // Walk geometry points computing metrics
    let gain = 0;
    let loss = 0;
    let maxAbsGrade = 0;

    let prevElev: number | null = null;
    let prevCoord = geom[0]!;

    for (let i = 0; i < geom.length; i++) {
      const elev = elevations[i];
      if (elev == null) {
        prevCoord = geom[i]!;
        continue;
      }

      if (prevElev != null) {
        const diff = elev - prevElev;
        if (diff > 0) gain += diff;
        else loss += -diff;

        // Compute grade between consecutive points
        const dist = haversineDistance(prevCoord, geom[i]!);
        if (dist > 0) {
          const grade = Math.abs(diff / dist * 100);
          if (grade > maxAbsGrade) maxAbsGrade = grade;
        }
      }

      prevElev = elev;
      prevCoord = geom[i]!;
    }

    // Average grade: (end elevation - start elevation) / horizontal distance * 100
    const firstElev = elevations.find((e) => e != null);
    let lastElev: number | null = null;
    for (let i = elevations.length - 1; i >= 0; i--) {
      if (elevations[i] != null) {
        lastElev = elevations[i]!;
        break;
      }
    }

    const horizontalDist = edge.attributes.lengthMeters;
    let averageGrade = 0;
    if (firstElev != null && lastElev != null && horizontalDist > 0) {
      averageGrade = (lastElev - firstElev) / horizontalDist * 100;
    }

    edge.attributes.elevationGain = gain;
    edge.attributes.elevationLoss = loss;
    edge.attributes.averageGrade = averageGrade;
    edge.attributes.maxGrade = maxAbsGrade;
    // Store per-geometry-point elevations for profile building.
    // Fill nulls via linear interpolation from neighbors.
    const filled = fillElevationGaps(elevations);
    if (filled) {
      edge.attributes.geometryElevations = filled;
    }
    edgesEnriched++;
  }

  return {
    nodesEnriched,
    nodesMissing,
    edgesEnriched,
    timeMs: Date.now() - startTime,
  };
}

/**
 * Fill null gaps in an elevation array via linear interpolation.
 * Returns null if fewer than 2 valid values exist.
 */
function fillElevationGaps(
  elevations: (number | null)[]
): number[] | null {
  // Find first and last valid indices
  let first = -1;
  let last = -1;
  for (let i = 0; i < elevations.length; i++) {
    if (elevations[i] != null) {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1 || first === last) return null;

  const result: number[] = new Array(elevations.length);

  // Extrapolate before first valid value
  for (let i = 0; i < first; i++) {
    result[i] = elevations[first]!;
  }
  // Extrapolate after last valid value
  for (let i = last + 1; i < elevations.length; i++) {
    result[i] = elevations[last]!;
  }

  // Interpolate between valid values
  let prevIdx = first;
  result[first] = elevations[first]!;
  for (let i = first + 1; i <= last; i++) {
    if (elevations[i] != null) {
      result[i] = elevations[i]!;
      // Fill any gap between prevIdx and i
      if (i - prevIdx > 1) {
        const startElev = elevations[prevIdx]!;
        const endElev = elevations[i]!;
        for (let j = prevIdx + 1; j < i; j++) {
          const t = (j - prevIdx) / (i - prevIdx);
          result[j] = startElev + t * (endElev - startElev);
        }
      }
      prevIdx = i;
    }
  }

  return result;
}
