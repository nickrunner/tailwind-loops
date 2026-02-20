// Context
export { TwlContext, useTwlContext, type TwlContextValue } from "./context/TwlContext.js";
export { TwlProvider, type TwlProviderProps } from "./context/TwlProvider.js";

// Client hooks
export {
  useRouteClient,
  useRegionClient,
  useConfigClient,
  useHealthClient,
} from "./hooks/useClients.js";

// API hooks — Routes
export { useGenerateRoutes } from "./hooks/useRoutes.js";

// API hooks — Regions
export {
  useRegionCache,
  useClearAllRegions,
  useClearRegion,
} from "./hooks/useRegions.js";

// API hooks — Config
export {
  useScoringDefaults,
  useScoringProfile,
  useProfiles,
  useSaveConfig,
  useSaveAsProfile,
} from "./hooks/useConfig.js";

// API hooks — Health
export { useHealth } from "./hooks/useHealth.js";

// Query utilities
export {
  type Remote,
  type Signature,
  type RemoteQueryOptions,
  useRemote,
  useDataMutation,
  useQueryInvalidation,
  invalidateQueriesContaining,
} from "./utils/query.utils.js";

// Re-export core types for convenience
export type {
  ActivityType,
  TurnFrequency,
  Coordinate,
  GenerateRouteRequest,
  GenerateRouteResponse,
  CorridorNetworkGeoJson,
  RouteStats,
  GeoJsonFeature,
  HealthResponse,
  CacheEntry,
  CacheListResponse,
  ProfileListItem,
  SaveConfigRequest,
  SaveConfigResponse,
  SaveAsProfileRequest,
  SaveAsProfileResponse,
  ClientConfig,
} from "@tailwind-loops/clients-core";
