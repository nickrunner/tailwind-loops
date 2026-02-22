/**
 * Mapillary enrichment provider.
 *
 * Fetches ML-detected point features (stop signs, traffic signals, crosswalks)
 * from the Mapillary API using street-level imagery analysis.
 */

import type {
  BoundingBox,
  EnrichableAttribute,
  Observation,
  PointDetection,
} from "@tailwind-loops/types";
import type { EnrichmentProvider } from "../provider.js";

// ---------------------------------------------------------------------------
// Mapillary API types
// ---------------------------------------------------------------------------

interface MapillaryFeature {
  id: string;
  object_type: string;
  object_value: string;
  geometry: { type: string; coordinates: [number, number] };
  first_seen_at?: string;
  last_seen_at?: string;
}

interface MapillaryResponse {
  data: MapillaryFeature[];
}

// ---------------------------------------------------------------------------
// Detection mapping
// ---------------------------------------------------------------------------

type DetectionAttribute = "stop-sign" | "traffic-signal" | "road-crossing";

/**
 * Map Mapillary object_value prefixes to enrichable attributes.
 * Mapillary uses hierarchical detection names like "regulatory--stop--g1".
 */
function mapDetection(objectValue: string): DetectionAttribute | null {
  if (objectValue.startsWith("regulatory--stop")) return "stop-sign";
  if (objectValue.startsWith("regulatory--traffic-signal") ||
      objectValue.startsWith("object--traffic-signal")) return "traffic-signal";
  if (objectValue.startsWith("marking--crosswalk") ||
      objectValue.startsWith("object--crosswalk")) return "road-crossing";
  return null;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface MapillaryProviderOptions {
  /** Mapillary API access token */
  accessToken: string;
  /** Delay between tile requests (ms). Default: 100 */
  rateLimitDelayMs?: number;
  /** Max bbox dimension per tile (degrees). Default: 0.01 */
  maxTileSizeDeg?: number;
  /** Injectable fetch function for testability */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class MapillaryProvider implements EnrichmentProvider {
  readonly source = "mapillary" as const;
  readonly name = "Mapillary Point Features";
  readonly provides: readonly EnrichableAttribute[] = [
    "stop-sign",
    "traffic-signal",
    "road-crossing",
  ];

  private readonly accessToken: string;
  private readonly rateLimitDelayMs: number;
  private readonly maxTileSizeDeg: number;
  private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;

  constructor(options: MapillaryProviderOptions) {
    this.accessToken = options.accessToken;
    this.rateLimitDelayMs = options.rateLimitDelayMs ?? 100;
    this.maxTileSizeDeg = options.maxTileSizeDeg ?? 0.01;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async fetchObservations(bounds: BoundingBox): Promise<Observation[]> {
    const tiles = subdivideBbox(bounds, this.maxTileSizeDeg);
    const allObservations: Observation[] = [];

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i]!;
      const features = await this.fetchTile(tile);
      for (const feature of features) {
        const obs = featureToObservation(feature);
        if (obs) allObservations.push(obs);
      }

      // Rate limit between tiles (skip after last)
      if (i < tiles.length - 1 && this.rateLimitDelayMs > 0) {
        await delay(this.rateLimitDelayMs);
      }
    }

    return allObservations;
  }

  private async fetchTile(bounds: BoundingBox): Promise<MapillaryFeature[]> {
    const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
    const url =
      `https://graph.mapillary.com/map_features` +
      `?bbox=${bbox}` +
      `&access_token=${this.accessToken}` +
      `&fields=id,geometry,object_value,object_type,first_seen_at,last_seen_at`;

    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`Mapillary API error: ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as MapillaryResponse;
    return json.data;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function featureToObservation(feature: MapillaryFeature): Observation | null {
  const attribute = mapDetection(feature.object_value);
  if (!attribute) return null;

  const [lng, lat] = feature.geometry.coordinates;
  const coordinate = { lat: lat!, lng: lng! };

  const detection: PointDetection = {
    coordinate,
    detectionConfidence: 0.75,
  };

  const obs: Observation<typeof attribute> = {
    attribute,
    source: "mapillary",
    value: detection,
    sourceConfidence: 0.7,
    geometry: [coordinate],
    observedAt: feature.last_seen_at ? new Date(feature.last_seen_at) : undefined,
  };

  return obs;
}

/**
 * Subdivide a bounding box into tiles no larger than `maxDeg` per side.
 */
function subdivideBbox(bounds: BoundingBox, maxDeg: number): BoundingBox[] {
  const tiles: BoundingBox[] = [];
  const latRange = bounds.maxLat - bounds.minLat;
  const lngRange = bounds.maxLng - bounds.minLng;
  // Subtract epsilon to avoid floating-point rounding creating extra tiles
  const EPS = 1e-9;
  const latSteps = Math.max(1, Math.ceil((latRange - EPS) / maxDeg));
  const lngSteps = Math.max(1, Math.ceil((lngRange - EPS) / maxDeg));
  const latStep = latRange / latSteps;
  const lngStep = lngRange / lngSteps;

  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lngSteps; j++) {
      tiles.push({
        minLat: bounds.minLat + i * latStep,
        maxLat: bounds.minLat + (i + 1) * latStep,
        minLng: bounds.minLng + j * lngStep,
        maxLng: bounds.minLng + (j + 1) * lngStep,
      });
    }
  }

  return tiles;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
