/**
 * API request/response types for the Tailwind Loops server.
 *
 * These mirror the server's models and are used by both core and react clients.
 */

// ---------------------------------------------------------------------------
// Coordinate
// ---------------------------------------------------------------------------

export interface Coordinate {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Route Generation
// ---------------------------------------------------------------------------

export type ActivityType = "road-cycling" | "gravel-cycling" | "running" | "walking";
export type TurnFrequency = "minimal" | "moderate" | "frequent";

export interface GenerateRouteRequest {
  activityType: ActivityType;
  startCoordinate: Coordinate;
  minDistanceMeters: number;
  maxDistanceMeters: number;
  /** Preferred compass bearing for outward direction (0-360) */
  preferredDirection?: number;
  turnFrequency?: TurnFrequency;
  /** Maximum number of alternative routes (default 3) */
  maxAlternatives?: number;
  /** Full scoring params override (takes precedence over profileName) */
  scoringParams?: Record<string, unknown>;
  /** Named profile to load (ignored if scoringParams provided) */
  profileName?: string;
}

export interface RouteStats {
  totalDistanceMeters: number;
  totalStops: number;
  distanceByCorridorType: Record<string, number>;
  distanceBySurface: Record<string, number>;
  averageInfrastructureContinuity: number;
  flowScore: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
}

export interface RouteFeatureProperties {
  routeIndex: number;
  isPrimary: boolean;
  isSegment: boolean;
  score?: number;
  distanceMeters?: number;
  distanceKm?: number;
  totalStops?: number;
  flowScore?: number;
  segmentCount?: number;
  elevationGain?: number | null;
  elevationLoss?: number | null;
  surface?: string;
  corridorName?: string | null;
  corridorType?: string;
  stroke: string;
  "stroke-width": number;
  "stroke-opacity": number;
}

export interface GeoJsonFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  properties: RouteFeatureProperties;
}

export interface CorridorNetworkGeoJson {
  type: "FeatureCollection";
  features: unknown[];
  _meta: {
    corridorCount: number;
  };
}

export interface GenerateRouteResponse {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
  _meta: {
    routeCount: number;
    searchTimeMs: number;
    primary: RouteStats;
  };
  corridorNetwork?: CorridorNetworkGeoJson;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface CacheStats {
  entries: number;
  totalSizeMB: number;
}

export interface HealthResponse {
  status: "ok";
  uptime: number;
  cache: CacheStats;
}

// ---------------------------------------------------------------------------
// Cache / Regions
// ---------------------------------------------------------------------------

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface CacheEntry {
  id: string;
  bbox: BoundingBox;
  innerBbox: BoundingBox;
  sizeMB: number;
}

export interface CacheListResponse {
  entries: CacheEntry[];
}

export interface CacheClearResponse {
  cleared: number;
}

// ---------------------------------------------------------------------------
// Config / Profiles
// ---------------------------------------------------------------------------

export interface ProfileListItem {
  name: string;
  description: string;
  extends: string;
}

// ---------------------------------------------------------------------------
// Config Save
// ---------------------------------------------------------------------------

export interface SaveConfigRequest {
  activityType: ActivityType;
  params: Record<string, unknown>;
  profileName?: string;
  asBase?: boolean;
}

export interface SaveConfigResponse {
  saved: boolean;
  activityType: string;
  profileName?: string;
}

export interface SaveAsProfileRequest {
  name: string;
  description: string;
  activityType: ActivityType;
  params: Record<string, unknown>;
}

export interface SaveAsProfileResponse {
  saved: boolean;
  name: string;
  activityType: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ErrorResponse {
  message: string;
}
