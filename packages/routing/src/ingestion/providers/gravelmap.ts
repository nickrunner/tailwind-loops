/**
 * Gravelmap.com surface data provider.
 *
 * Gravelmap is a crowd-sourced database of gravel and unpaved roads,
 * specifically curated for cycling. It's one of the highest-quality
 * sources for surface data on non-paved routes.
 *
 * API: https://gravelmap.com (documentation TBD)
 */

import type { GraphEdge, SurfaceObservation, SurfaceType } from "../../domain/index.js";
import type { BoundingBox, SurfaceDataProvider } from "../index.js";

/** Gravelmap API configuration */
export interface GravelmapConfig {
  /** API key (if required) */
  apiKey?: string;
  /** API base URL */
  baseUrl?: string;
}

/** A segment from Gravelmap API */
interface GravelmapSegment {
  id: string;
  geometry: { lat: number; lng: number }[];
  surface: "gravel" | "dirt" | "paved" | "unknown";
  quality?: number; // 1-5 rating
  lastUpdated?: string;
}

/**
 * Surface data provider for Gravelmap.com
 */
export class GravelmapProvider implements SurfaceDataProvider {
  readonly source = "gravelmap" as const;
  readonly name = "Gravelmap.com";

  private config: GravelmapConfig;
  private cache: Map<string, GravelmapSegment[]> = new Map();

  constructor(config: GravelmapConfig = {}) {
    this.config = {
      baseUrl: "https://api.gravelmap.com/v1",
      ...config,
    };
  }

  async fetchObservations(
    bounds: BoundingBox
  ): Promise<Map<string, SurfaceObservation>> {
    // TODO: Implement Gravelmap API call
    // 1. Call API with bounding box
    // 2. Parse response into GravelmapSegment[]
    // 3. Convert to SurfaceObservation map keyed by geometry hash

    const observations = new Map<string, SurfaceObservation>();

    // Placeholder - would fetch from API
    const segments = await this.fetchSegments(bounds);

    for (const segment of segments) {
      const hash = this.geometryHash(segment.geometry);
      observations.set(hash, this.toObservation(segment));
    }

    return observations;
  }

  async matchEdge(edge: GraphEdge): Promise<SurfaceObservation | null> {
    // TODO: Implement edge matching
    // 1. Check cache for nearby segments
    // 2. Use spatial matching (buffer overlap, Hausdorff distance, etc.)
    // 3. Return best matching observation

    // Placeholder - would use spatial index
    return null;
  }

  private async fetchSegments(_bounds: BoundingBox): Promise<GravelmapSegment[]> {
    // TODO: Implement actual API call
    // const url = `${this.config.baseUrl}/segments?bbox=${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
    // const response = await fetch(url, { headers: { Authorization: this.config.apiKey } });
    // return response.json();

    throw new Error("Not implemented: Gravelmap API integration");
  }

  private toObservation(segment: GravelmapSegment): SurfaceObservation {
    const surfaceMap: Record<GravelmapSegment["surface"], SurfaceType> = {
      gravel: "gravel",
      dirt: "dirt",
      paved: "paved",
      unknown: "unknown",
    };

    // Quality rating affects confidence (1-5 -> 0.6-1.0)
    const qualityConfidence = segment.quality
      ? 0.6 + (segment.quality / 5) * 0.4
      : 0.8;

    return {
      source: "gravelmap",
      surface: surfaceMap[segment.surface],
      sourceConfidence: qualityConfidence,
      observedAt: segment.lastUpdated ? new Date(segment.lastUpdated) : undefined,
    };
  }

  private geometryHash(geometry: { lat: number; lng: number }[]): string {
    // Simple hash based on start/end points and length
    // In production, would use a more sophisticated spatial hash
    if (geometry.length === 0) return "empty";

    const start = geometry[0];
    const end = geometry[geometry.length - 1];

    if (!start || !end) return "invalid";

    return `${start.lat.toFixed(5)},${start.lng.toFixed(5)}-${end.lat.toFixed(5)},${end.lng.toFixed(5)}-${geometry.length}`;
  }
}
