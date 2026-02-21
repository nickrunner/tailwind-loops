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
  maxGradePercent?: number;
}

export interface CorridorScore {
  overall: number;
  flow: number;
  safety: number;
  surface: number;
  character: number;
  scenic: number;
  elevation: number;
}

export interface CorridorAttributes {
  lengthMeters: number;
  predominantRoadClass: string;
  predominantSurface: string;
  surfaceConfidence: number;
  averageSpeedLimit?: number;
  stopDensityPerKm: number;
  crossingDensityPerKm: number;
  bicycleInfraContinuity: number;
  pedestrianPathContinuity: number;
  separationContinuity: number;
  turnsCount: number;
  trafficCalmingContinuity: number;
  scenicScore: number;
  totalElevationGain?: number;
  totalElevationLoss?: number;
  averageGrade?: number;
  maxGrade?: number;
  elevationProfile?: number[];
  hillinessIndex?: number;
}

export interface CorridorSegment {
  kind: "corridor";
  corridor: {
    id: string;
    name: string | null;
    type: string;
    attributes: CorridorAttributes;
    score: CorridorScore | null;
  };
  reversed: boolean;
  geometry: Coordinate[];
}

export interface ConnectingSegment {
  kind: "connecting";
  geometry: Coordinate[];
}

export type RouteSegment = CorridorSegment | ConnectingSegment;

export interface Route {
  id: string;
  segments: RouteSegment[];
  stats: RouteStats;
  geometry: Coordinate[];
  score: number;
}

export interface GenerateRouteResponse {
  route: Route;
  meta: {
    searchTimeMs: number;
  };
}

// ---------------------------------------------------------------------------
// Corridor Network
// ---------------------------------------------------------------------------

export interface CorridorNetworkRequest {
  activityType: ActivityType;
  startCoordinate: Coordinate;
  maxDistanceMeters: number;
  scoringParams?: Record<string, unknown>;
  profileName?: string;
  excludeTypes?: string[];
  includeConnectors?: boolean;
}

export interface CorridorNetworkGeoJson {
  type: "FeatureCollection";
  features: unknown[];
  _meta: {
    corridorCount: number;
  };
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

export interface CacheHitZone {
  id: string;
  sizeMB: number;
  networkBounds: BoundingBox;
  hitBounds: BoundingBox;
}

export interface CacheHitZonesResponse {
  zones: CacheHitZone[];
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
