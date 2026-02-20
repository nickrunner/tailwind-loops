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
  loadBaseConfig,
  loadProfileConfig,
  type ScoringParams,
} from "@tailwind-loops/routing";
import type { GenerateRouteRequest } from "../models/requests.js";
import { RegionBuildService } from "./region-build.service.js";

/** Build per-segment GeoJSON features for a route, with surface info for coloring. */
export function routeToSegmentFeatures(
  route: Route,
  routeIndex: number,
  graph: Graph,
): unknown[] {
  const isPrimary = routeIndex === 0;
  const baseColor = isPrimary ? "#2563eb" : "#9333ea";
  const unpavedColor = isPrimary ? "#d97706" : "#b45309";
  const features: unknown[] = [];

  for (const seg of route.segments) {
    const coords: [number, number][] = [];
    let surface = "unknown";

    if (seg.kind === "corridor") {
      surface = seg.corridor.attributes.predominantSurface;
      for (const edgeId of seg.traversedEdgeIds) {
        const edge = graph.edges.get(edgeId);
        if (!edge) continue;
        for (const c of edge.geometry) {
          const pt: [number, number] = [c.lng, c.lat];
          if (coords.length > 0) {
            const last = coords[coords.length - 1]!;
            if (
              Math.abs(last[0] - pt[0]) < 1e-8 &&
              Math.abs(last[1] - pt[1]) < 1e-8
            )
              continue;
          }
          coords.push(pt);
        }
      }
    } else {
      for (const edge of seg.edges) {
        for (const c of edge.geometry) {
          const pt: [number, number] = [c.lng, c.lat];
          if (coords.length > 0) {
            const last = coords[coords.length - 1]!;
            if (
              Math.abs(last[0] - pt[0]) < 1e-8 &&
              Math.abs(last[1] - pt[1]) < 1e-8
            )
              continue;
          }
          coords.push(pt);
        }
      }
    }

    if (coords.length < 2) continue;

    const color = surface === "unpaved" ? unpavedColor : baseColor;

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {
        routeIndex,
        isPrimary,
        isSegment: true,
        surface,
        corridorName:
          seg.kind === "corridor" ? (seg.corridor.name ?? null) : null,
        corridorType:
          seg.kind === "corridor" ? seg.corridor.type : "connector",
        stroke: color,
        "stroke-width": isPrimary ? 4 : 3,
        "stroke-opacity": isPrimary ? 0.9 : 0.6,
      },
    });
  }

  // Route-level summary feature
  features.push({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: route.geometry.map(
        (c) => [c.lng, c.lat] as [number, number],
      ),
    },
    properties: {
      routeIndex,
      isPrimary,
      isSegment: false,
      score: Math.round(route.score * 1000) / 1000,
      distanceMeters: Math.round(route.stats.totalDistanceMeters),
      distanceKm:
        Math.round(route.stats.totalDistanceMeters / 100) / 10,
      totalStops: route.stats.totalStops,
      flowScore: route.stats.flowScore,
      segmentCount: route.segments.length,
      elevationGain: route.stats.elevationGainMeters ?? null,
      elevationLoss: route.stats.elevationLossMeters ?? null,
      surfacePaved: route.stats.distanceBySurface?.["paved"] ?? 0,
      surfaceUnpaved: route.stats.distanceBySurface?.["unpaved"] ?? 0,
      surfaceUnknown: route.stats.distanceBySurface?.["unknown"] ?? 0,
      stroke: "#000000",
      "stroke-width": 0,
      "stroke-opacity": 0,
    },
  });

  return features;
}

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
  ): Promise<{ type: string; features: unknown[]; _meta: unknown }> {
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

    return {
      type: "FeatureCollection",
      features,
      _meta: {
        routeCount: 1 + result.alternatives.length,
        searchTimeMs: Math.round(elapsed * 100) / 100,
        primary: result.primary.stats,
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
