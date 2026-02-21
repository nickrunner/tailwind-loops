import type { ScoringParams } from "@tailwind-loops/routing";

export interface GenerateRouteRequest {
  activityType: "road-cycling" | "gravel-cycling" | "running" | "walking";
  startCoordinate: { lat: number; lng: number };
  minDistanceMeters: number;
  maxDistanceMeters: number;
  /** Preferred compass bearing for outward direction (0-360) */
  preferredDirection?: number;
  turnFrequency?: "minimal" | "moderate" | "frequent";
  /** Full scoring params override (takes precedence over profileName) */
  scoringParams?: ScoringParams;
  /** Named profile to load (ignored if scoringParams provided) */
  profileName?: string;
}

export interface SaveConfigRequest {
  activityType: "road-cycling" | "gravel-cycling" | "running" | "walking";
  params: ScoringParams;
  /** If provided and asBase is false, saves as this profile name */
  profileName?: string;
  /** If true, saves as base config (default if no profileName) */
  asBase?: boolean;
}

export interface SaveAsProfileRequest {
  name: string;
  description: string;
  activityType: "road-cycling" | "gravel-cycling" | "running" | "walking";
  params: ScoringParams;
}

export interface CorridorNetworkRequest {
  activityType: "road-cycling" | "gravel-cycling" | "running" | "walking";
  startCoordinate: { lat: number; lng: number };
  maxDistanceMeters: number;
  /** Full scoring params override (takes precedence over profileName) */
  scoringParams?: ScoringParams;
  /** Named profile to load (ignored if scoringParams provided) */
  profileName?: string;
  /** Corridor types to exclude from the response */
  excludeTypes?: string[];
  /** Include connector features (default: false) */
  includeConnectors?: boolean;
}
