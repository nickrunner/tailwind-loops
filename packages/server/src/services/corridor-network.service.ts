/**
 * Corridor network service — scoring + GeoJSON conversion.
 *
 * Returns the corridor network as a GeoJSON FeatureCollection,
 * scored and filtered by activity type.
 */

import type { ActivityType } from "@tailwind-loops/types";
import {
  scoreCorridorWithParams,
  corridorNetworkToGeoJson,
  loadBaseConfig,
  loadProfileConfig,
  type ScoringParams,
} from "@tailwind-loops/routing";
import type { CorridorNetworkRequest } from "../models/requests.js";
import type { CorridorNetworkResponse } from "../models/responses.js";
import { RegionBuildService } from "./region-build.service.js";

export class CorridorNetworkService {
  private regionBuild = new RegionBuildService();

  /**
   * Build, score, and return corridor network as GeoJSON.
   */
  async getNetwork(req: CorridorNetworkRequest): Promise<CorridorNetworkResponse> {
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
    const { network } = await this.regionBuild.buildForCoordinate(
      req.startCoordinate,
      req.maxDistanceMeters,
    );

    // Score corridors
    for (const corridor of network.corridors.values()) {
      const score = scoreCorridorWithParams(corridor, scoringParams);
      if (!corridor.scores) corridor.scores = {};
      corridor.scores[activityType] = score;
    }

    // Convert to GeoJSON
    const includeConnectors = req.includeConnectors ?? false;
    const geoJson = corridorNetworkToGeoJson(network, {
      includeConnectors,
      scoreActivity: activityType,
    });

    // Filter by excluded types and activity-specific rules
    const excludeTypes = new Set(req.excludeTypes ?? []);
    const excludedRoadClasses = new Set(["service", "track", "footway"]);

    const filteredFeatures = geoJson.features.filter((f) => {
      const props = f.properties;
      const ct = props["corridorType"] as string | undefined;
      const surface = props["predominantSurface"] as string | undefined;
      const roadClass = props["roadClass"] as string | undefined;
      if (ct && excludeTypes.has(ct)) return false;
      if (activityType === "road-cycling" && surface === "unpaved") return false;
      if (activityType === "road-cycling" && roadClass && excludedRoadClasses.has(roadClass)) return false;
      return true;
    });

    return {
      type: "FeatureCollection",
      features: filteredFeatures,
      _meta: { corridorCount: filteredFeatures.length },
    };
  }
}
