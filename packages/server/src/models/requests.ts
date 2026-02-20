import type { ScoringParams } from "@tailwind-loops/routing";

export interface GenerateRouteRequest {
  activityType: "road-cycling" | "gravel-cycling" | "running" | "walking";
  startCoordinate: { lat: number; lng: number };
  minDistanceMeters: number;
  maxDistanceMeters: number;
  /** Preferred compass bearing for outward direction (0-360) */
  preferredDirection?: number;
  turnFrequency?: "minimal" | "moderate" | "frequent";
  /** Maximum number of alternative routes (default 3) */
  maxAlternatives?: number;
  /** Full scoring params override (takes precedence over profileName) */
  scoringParams?: ScoringParams;
  /** Named profile to load (ignored if scoringParams provided) */
  profileName?: string;
}
