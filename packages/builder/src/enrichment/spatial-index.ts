/**
 * Grid-based spatial index for matching observations to graph edges.
 *
 * Uses ~100m grid cells with flat-earth approximation for fast lookups.
 * No external dependencies required.
 */

import type { Coordinate, Graph, GraphEdge, Observation } from "@tailwind-loops/types";

/** Default grid cell size in meters */
const DEFAULT_CELL_SIZE = 100;

/** Default max distance for snapping observations to edges (meters) */
const DEFAULT_MAX_DISTANCE = 50;

/** Meters per degree of latitude (roughly constant) */
const METERS_PER_DEG_LAT = 111_320;

/**
 * Grid-based spatial index built from graph edges.
 *
 * Each edge is indexed into all grid cells it passes through.
 * Observations are matched to edges by proximity.
 */
export class EdgeSpatialIndex {
  /** cell key -> set of edge IDs */
  private grid = new Map<string, Set<string>>();
  private cellSize: number;
  private midLat: number;
  private metersPerDegLng: number;

  constructor(
    private readonly graph: Graph,
    cellSizeMeters: number = DEFAULT_CELL_SIZE
  ) {
    this.cellSize = cellSizeMeters;

    // Compute mid-latitude for lng-to-meters conversion
    let sumLat = 0;
    let count = 0;
    for (const node of graph.nodes.values()) {
      sumLat += node.coordinate.lat;
      count++;
    }
    this.midLat = count > 0 ? sumLat / count : 42; // fallback ~Michigan
    this.metersPerDegLng =
      METERS_PER_DEG_LAT * Math.cos((this.midLat * Math.PI) / 180);

    this.buildIndex();
  }

  /**
   * Snap a point observation to the nearest edge within maxDistance.
   * Returns the edge ID or null if nothing is within range.
   */
  snapToEdge(
    coord: { lat: number; lng: number },
    maxDistance: number = DEFAULT_MAX_DISTANCE
  ): string | null {
    const candidates = this.getCandidateEdges(coord);
    let bestId: string | null = null;
    let bestDist = maxDistance;

    for (const edgeId of candidates) {
      const edge = this.graph.edges.get(edgeId)!;
      const dist = this.distanceToEdge(coord, edge);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = edgeId;
      }
    }

    return bestId;
  }

  /**
   * Match a linestring observation to edges it overlaps.
   * Returns edge IDs where the observation geometry is within maxDistance.
   */
  matchLinestring(
    coords: { lat: number; lng: number }[],
    maxDistance: number = DEFAULT_MAX_DISTANCE
  ): string[] {
    const matchedEdges = new Set<string>();

    for (const coord of coords) {
      const candidates = this.getCandidateEdges(coord);
      for (const edgeId of candidates) {
        if (matchedEdges.has(edgeId)) continue;
        const edge = this.graph.edges.get(edgeId)!;
        const dist = this.distanceToEdge(coord, edge);
        if (dist < maxDistance) {
          matchedEdges.add(edgeId);
        }
      }
    }

    return [...matchedEdges];
  }

  /**
   * Batch-match observations to edges.
   * Returns a map of edgeId -> observations matched to that edge.
   */
  matchToEdges(
    observations: Observation[],
    maxDistance: number = DEFAULT_MAX_DISTANCE
  ): Map<string, Observation[]> {
    const result = new Map<string, Observation[]>();

    for (const obs of observations) {
      const edgeIds = this.matchObservation(obs, maxDistance);
      for (const edgeId of edgeIds) {
        let list = result.get(edgeId);
        if (!list) {
          list = [];
          result.set(edgeId, list);
        }
        list.push(obs);
      }
    }

    return result;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private buildIndex(): void {
    for (const edge of this.graph.edges.values()) {
      const cells = new Set<string>();
      for (const coord of edge.geometry) {
        cells.add(this.cellKey(coord));
      }
      for (const key of cells) {
        let set = this.grid.get(key);
        if (!set) {
          set = new Set();
          this.grid.set(key, set);
        }
        set.add(edge.id);
      }
    }
  }

  private matchObservation(
    obs: Observation,
    maxDistance: number
  ): string[] {
    // Point observations (signs, signals, crossings)
    if (
      obs.attribute === "stop-sign" ||
      obs.attribute === "traffic-signal" ||
      obs.attribute === "road-crossing"
    ) {
      const detection = obs.value as { coordinate: { lat: number; lng: number } };
      const edgeId = this.snapToEdge(detection.coordinate, maxDistance);
      return edgeId ? [edgeId] : [];
    }

    // Observations with explicit geometry (linestrings)
    if (obs.geometry && obs.geometry.length > 0) {
      return this.matchLinestring(obs.geometry, maxDistance);
    }

    // No spatial information — can't match
    return [];
  }

  private getCandidateEdges(coord: { lat: number; lng: number }): Set<string> {
    const candidates = new Set<string>();
    const key = this.cellKey(coord);

    // Check the cell and its 8 neighbors
    const [cx, cy] = this.cellCoords(coord);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborKey = `${cx + dx},${cy + dy}`;
        const set = this.grid.get(neighborKey);
        if (set) {
          for (const id of set) candidates.add(id);
        }
      }
    }

    return candidates;
  }

  private cellKey(coord: { lat: number; lng: number }): string {
    const [cx, cy] = this.cellCoords(coord);
    return `${cx},${cy}`;
  }

  private cellCoords(coord: { lat: number; lng: number }): [number, number] {
    const mx = coord.lng * this.metersPerDegLng;
    const my = coord.lat * METERS_PER_DEG_LAT;
    return [Math.floor(mx / this.cellSize), Math.floor(my / this.cellSize)];
  }

  /**
   * Minimum distance from a point to any segment of an edge's geometry.
   * Uses flat-earth approximation.
   */
  private distanceToEdge(
    point: { lat: number; lng: number },
    edge: GraphEdge
  ): number {
    const geom = edge.geometry;
    if (geom.length === 0) return Infinity;
    if (geom.length === 1) return this.pointDistance(point, geom[0]!);

    let minDist = Infinity;
    for (let i = 0; i < geom.length - 1; i++) {
      const dist = this.perpendicularDistance(point, geom[i]!, geom[i + 1]!);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  private pointDistance(
    a: { lat: number; lng: number },
    b: Coordinate
  ): number {
    const dx = (a.lng - b.lng) * this.metersPerDegLng;
    const dy = (a.lat - b.lat) * METERS_PER_DEG_LAT;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Perpendicular distance from a point to a line segment (meters).
   * Reuses the pattern from corridor-attributes.ts.
   */
  private perpendicularDistance(
    point: { lat: number; lng: number },
    lineStart: Coordinate,
    lineEnd: Coordinate
  ): number {
    const px = (point.lng - lineStart.lng) * this.metersPerDegLng;
    const py = (point.lat - lineStart.lat) * METERS_PER_DEG_LAT;
    const lx = (lineEnd.lng - lineStart.lng) * this.metersPerDegLng;
    const ly = (lineEnd.lat - lineStart.lat) * METERS_PER_DEG_LAT;

    const lineLenSq = lx * lx + ly * ly;
    if (lineLenSq === 0) return Math.sqrt(px * px + py * py);

    const t = Math.max(0, Math.min(1, (px * lx + py * ly) / lineLenSq));
    const dx = px - t * lx;
    const dy = py - t * ly;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
