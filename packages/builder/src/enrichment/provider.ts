/**
 * Generalized enrichment provider interface.
 *
 * Providers only fetch observations
 * for a region — spatial matching to edges is handled centrally by the
 * pipeline via the spatial index.
 */

import type {
  BoundingBox,
  DataSource,
  EnrichableAttribute,
  Observation,
} from "@tailwind-loops/types";

/**
 * A provider of enrichment data for graph edges.
 *
 * Implementations fetch raw observations for a geographic region.
 * The pipeline handles matching observations to edges and fusing them.
 */
export interface EnrichmentProvider {
  /** Which data source this provider represents */
  readonly source: DataSource;
  /** Human-readable name */
  readonly name: string;
  /** Which attributes this provider can supply data for */
  readonly provides: readonly EnrichableAttribute[];
  /**
   * Fetch observations for edges within a bounding box.
   * Returns a flat array; the pipeline groups them by edge.
   */
  fetchObservations(bounds: BoundingBox): Promise<Observation[]>;
}
