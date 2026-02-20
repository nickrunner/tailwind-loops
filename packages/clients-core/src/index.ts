// Base
export { BaseClient, type ClientConfig, type RequestParams } from "./baseClient.js";

// Domain clients
export { RouteClient } from "./routeClient.js";
export { RegionClient } from "./regionClient.js";
export { ConfigClient } from "./configClient.js";
export { HealthClient } from "./healthClient.js";

// Types
export type {
  // Coordinate
  Coordinate,
  // Route
  ActivityType,
  TurnFrequency,
  GenerateRouteRequest,
  RouteStats,
  RouteFeatureProperties,
  GeoJsonFeature,
  GenerateRouteResponse,
  CorridorNetworkGeoJson,
  // Health
  CacheStats,
  HealthResponse,
  // Cache / Regions
  BoundingBox,
  CacheEntry,
  CacheListResponse,
  CacheClearResponse,
  // Config
  ProfileListItem,
  SaveConfigRequest,
  SaveConfigResponse,
  SaveAsProfileRequest,
  SaveAsProfileResponse,
  // Errors
  ErrorResponse,
} from "./types.js";
