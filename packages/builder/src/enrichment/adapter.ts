/**
 * Adapter wrapping legacy SurfaceDataProvider as an EnrichmentProvider.
 *
 * This allows existing providers (e.g. GravelmapProvider) to work with
 * the new enrichment pipeline without being rewritten.
 */

import type {
  BoundingBox,
  DataSource,
  EnrichableAttribute,
  Observation,
  SurfaceDataSource,
} from "@tailwind-loops/types";
import type { SurfaceDataProvider } from "../ingestion/index.js";
import type { EnrichmentProvider } from "./provider.js";

/** Map legacy SurfaceDataSource to the new DataSource union */
const SOURCE_MAP: Record<SurfaceDataSource, DataSource> = {
  "osm-surface-tag": "osm-tag",
  "osm-highway-inferred": "osm-inferred",
  "gravelmap": "gravelmap",
  "strava-heatmap": "osm-inferred", // closest fit
  "user-report": "user-report",
  "satellite-ml": "osm-inferred", // closest fit
};

/**
 * Wraps a legacy SurfaceDataProvider as an EnrichmentProvider.
 *
 * Converts SurfaceObservation results into the generalized Observation format.
 */
export class SurfaceProviderAdapter implements EnrichmentProvider {
  readonly source: DataSource;
  readonly name: string;
  readonly provides: readonly EnrichableAttribute[] = ["surface"];

  constructor(private readonly legacy: SurfaceDataProvider) {
    this.source = SOURCE_MAP[legacy.source] ?? "osm-tag";
    this.name = legacy.name;
  }

  async fetchObservations(bounds: BoundingBox): Promise<Observation[]> {
    const legacyObs = await this.legacy.fetchObservations(bounds);
    const observations: Observation[] = [];

    for (const [_hash, obs] of legacyObs) {
      observations.push({
        attribute: "surface",
        source: this.source,
        value: obs.surface,
        sourceConfidence: obs.sourceConfidence,
        observedAt: obs.observedAt,
      });
    }

    return observations;
  }
}
