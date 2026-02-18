/**
 * Generalized data enrichment pipeline.
 *
 * Re-exports the public API for enriching graph edges from multiple
 * data sources with per-attribute confidence tracking.
 */

export type { EnrichmentProvider } from "./provider.js";
export { SurfaceProviderAdapter } from "./adapter.js";
export { EdgeSpatialIndex } from "./spatial-index.js";
export {
  type FusionStrategy,
  type FusionResult,
  type AnyFusionStrategy,
  SurfaceFusionStrategy,
  SpeedLimitFusionStrategy,
  PointDetectionFusionStrategy,
  BooleanFusionStrategy,
  NumericFusionStrategy,
  createDefaultStrategies,
} from "./fusion.js";
export {
  enrichGraph,
  type EnrichmentOptions,
  type EnrichmentStats,
  type ProviderStats,
  type AttributeStats,
} from "./pipeline.js";
