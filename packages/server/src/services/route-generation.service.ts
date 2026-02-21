/**
 * Route generation service — scoring + beam search.
 *
 * Takes a built corridor network and produces a Route.
 * Extracted from packages/tuner/src/server.ts
 */

import type {
  Graph,
  CorridorNetwork,
  ActivityType,
  LoopSearchParams,
  Route,
  RouteSegment,
} from "@tailwind-loops/types";
import {
  scoreCorridorWithParams,
  generateLoopRoutes,
  loadBaseConfig,
  loadProfileConfig,
  type ScoringParams,
} from "@tailwind-loops/routing";
import type { GenerateRouteRequest } from "../models/requests.js";
import type { GenerateRouteResponse } from "../models/responses.js";
import { RegionBuildService } from "./region-build.service.js";

export class RouteGenerationService {
  private regionBuild = new RegionBuildService();

  getRegionBuild(): RegionBuildService {
    return this.regionBuild;
  }

  /**
   * Generate loop routes from a request.
   * Handles the full pipeline: resolve scoring params → build region → score → search → return Route.
   */
  async generate(req: GenerateRouteRequest): Promise<GenerateRouteResponse> {
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

    return {
      route: toRouteResponse(result, activityType),
      meta: {
        searchTimeMs: Math.round(elapsed * 100) / 100,
      },
    };
  }
}

/**
 * Map internal Route → client-facing response, stripping graph plumbing
 * (edgeIds, startNodeId, endNodeId, oneWay, isDestination, ConnectingSegment.edges).
 */
function toRouteResponse(route: Route, activityType: ActivityType) {
  return {
    id: route.id,
    segments: route.segments.map((seg) => toSegmentResponse(seg, activityType)),
    stats: route.stats,
    geometry: route.geometry,
    score: route.score,
  };
}

function toSegmentResponse(seg: RouteSegment, activityType: ActivityType) {
  if (seg.kind === "corridor") {
    return {
      kind: "corridor" as const,
      corridor: {
        id: seg.corridor.id,
        name: seg.corridor.name ?? null,
        type: seg.corridor.type,
        attributes: seg.corridor.attributes,
        score: seg.corridor.scores?.[activityType] ?? null,
      },
      reversed: seg.reversed,
      geometry: seg.geometry,
    };
  }
  return {
    kind: "connecting" as const,
    geometry: seg.geometry,
  };
}

export class RouteNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteNotFoundError";
  }
}
