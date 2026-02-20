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

export interface ErrorResponse {
  message: string;
}
