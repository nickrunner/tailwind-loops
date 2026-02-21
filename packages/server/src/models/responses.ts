export interface HealthResponse {
  status: "ok";
  uptime: number;
  cache: CacheStats;
}

export interface CacheStats {
  entries: number;
  totalSizeMB: number;
}

export interface CacheEntry {
  id: string;
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  innerBbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  sizeMB: number;
}

export interface CacheListResponse {
  entries: CacheEntry[];
}

export interface CacheClearResponse {
  cleared: number;
}

export interface ProfileListItem {
  name: string;
  description: string;
  extends: string;
}

export interface SaveConfigResponse {
  saved: boolean;
  activityType: string;
  profileName?: string;
}

export interface SaveAsProfileResponse {
  saved: boolean;
  name: string;
  activityType: string;
}

export interface CacheHitZone {
  id: string;
  sizeMB: number;
  networkBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  hitBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export interface CacheHitZonesResponse {
  zones: CacheHitZone[];
}

export interface RouteCorridorScore {
  overall: number;
  flow: number;
  safety: number;
  surface: number;
  character: number;
  scenic: number;
  elevation: number;
}

export interface RouteCorridorAttributes {
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

export interface RouteCorridorSegment {
  kind: "corridor";
  corridor: {
    id: string;
    name: string | null;
    type: string;
    attributes: RouteCorridorAttributes;
    score: RouteCorridorScore | null;
  };
  reversed: boolean;
  geometry: { lat: number; lng: number }[];
}

export interface RouteConnectingSegment {
  kind: "connecting";
  geometry: { lat: number; lng: number }[];
}

export type RouteSegmentResponse = RouteCorridorSegment | RouteConnectingSegment;

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

export interface GenerateRouteResponse {
  route: {
    id: string;
    segments: RouteSegmentResponse[];
    stats: RouteStats;
    geometry: { lat: number; lng: number }[];
    score: number;
  };
  meta: {
    searchTimeMs: number;
  };
}

export interface CorridorNetworkResponse {
  type: "FeatureCollection";
  features: unknown[];
  _meta: {
    corridorCount: number;
  };
}

export interface ErrorResponse {
  message: string;
}
