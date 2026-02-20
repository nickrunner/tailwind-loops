/**
 * Route generation service — scoring + beam search + GeoJSON conversion.
 *
 * Takes a built corridor network and produces route GeoJSON.
 * Extracted from packages/tuner/src/server.ts
 */

import type {
  Graph,
  CorridorNetwork,
  ActivityType,
  Route,
  LoopSearchParams,
} from "@tailwind-loops/types";
import {
  scoreCorridorWithParams,
  generateLoopRoutes,
  corridorNetworkToGeoJson,
  routeToSegmentFeatures,
  loadBaseConfig,
  loadProfileConfig,
  type ScoringParams,
} from "@tailwind-loops/routing";
import type { GenerateRouteRequest } from "../models/requests.js";
import { RegionBuildService } from "./region-build.service.js";

export class RouteGenerationService {
  private regionBuild = new RegionBuildService();

  getRegionBuild(): RegionBuildService {
    return this.regionBuild;
  }

  /**
   * Generate loop routes from a request.
   * Handles the full pipeline: resolve scoring params → build region → score → search → GeoJSON.
   */
  async generate(
    req: GenerateRouteRequest,
  ): Promise<{ type: string; features: unknown[]; _meta: unknown; corridorNetwork?: unknown }> {
    const activityType = req.activityType as ActivityType;

    // Resolve scoring params: explicit > profile > base defaults
    let scoringParams: ScoringParams;
    if (req.scoringParams) {
      scoringParams = req.scoringParams;
    } else if (req.profileName) {
      scoringParams = loadProfileConfig(req.profileName);
    } else {
      scoringParams = loadBaseConfig(activityType);
    }

    // Build or retrieve corridor network
    const { graph, network } = await this.regionBuild.buildForCoordinate(
      req.startCoordinate,
      req.maxDistanceMeters,
    );

    console.log(
      `[route-gen] ${activityType}, range=${(req.minDistanceMeters / 1609.34).toFixed(1)}-${(req.maxDistanceMeters / 1609.34).toFixed(1)}mi`,
    );
    console.log(
      `[route-gen] Network: ${network.corridors.size} corridors, ${network.connectors.size} connectors`,
    );

    const start = performance.now();

    // Re-score corridors with provided params
    for (const corridor of network.corridors.values()) {
      const score = scoreCorridorWithParams(corridor, scoringParams);
      if (!corridor.scores) corridor.scores = {};
      corridor.scores[activityType] = score;
    }

    console.log(
      `[route-gen] Scored in ${(performance.now() - start).toFixed(0)}ms. Running route search...`,
    );

    // Generate loop routes
    const loopParams: LoopSearchParams = {
      startCoordinate: req.startCoordinate,
      minDistanceMeters: req.minDistanceMeters,
      maxDistanceMeters: req.maxDistanceMeters,
      preferredDirection: req.preferredDirection,
      turnFrequency: req.turnFrequency,
      maxAlternatives: req.maxAlternatives,
    };

    const result = generateLoopRoutes(
      network,
      graph,
      activityType,
      loopParams,
    );

    if (!result) {
      throw new RouteNotFoundError(
        "No routes found. Try adjusting distance or start location.",
      );
    }

    const elapsed = performance.now() - start;

    // Convert to per-segment GeoJSON
    const features: unknown[] = [];
    for (const [idx, route] of [result.primary, ...result.alternatives].entries()) {
      features.push(...routeToSegmentFeatures(route, idx, graph));
    }

    // Build corridor network GeoJSON filtered by activity type
    const corridorGeoJson = corridorNetworkToGeoJson(network, {
      includeConnectors: false,
      scoreActivity: activityType,
    });
    const excludedTypes = new Set(["path", "trail"]);
    const excludedRoadClasses = new Set(["service", "track", "footway"]);
    const filteredCorridorFeatures = (corridorGeoJson.features as unknown as Record<string, unknown>[]).filter((f) => {
      const props = f["properties"] as Record<string, unknown> | undefined;
      const ct = props?.["corridorType"] as string | undefined;
      const surface = props?.["predominantSurface"] as string | undefined;
      const roadClass = props?.["roadClass"] as string | undefined;
      if (ct && excludedTypes.has(ct)) return false;
      if (activityType === "road-cycling" && surface === "unpaved") return false;
      if (activityType === "road-cycling" && roadClass && excludedRoadClasses.has(roadClass)) return false;
      return true;
    });

    return {
      type: "FeatureCollection",
      features,
      _meta: {
        routeCount: 1 + result.alternatives.length,
        searchTimeMs: Math.round(elapsed * 100) / 100,
        primary: result.primary.stats,
      },
      corridorNetwork: {
        type: "FeatureCollection",
        features: filteredCorridorFeatures,
        _meta: { corridorCount: filteredCorridorFeatures.length },
      },
    };
  }
}

export class RouteNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteNotFoundError";
  }
}
