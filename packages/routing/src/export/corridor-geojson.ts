/**
 * GeoJSON export for CorridorNetwork data.
 *
 * Exports corridors and connectors as color-coded GeoJSON FeatureCollections.
 * Useful for visualization in QGIS, geojson.io, Mapbox, Kepler.gl, etc.
 */

import type {
  Coordinate,
  Corridor,
  CorridorNetwork,
  CorridorType,
  Connector,
  ActivityType,
} from "@tailwind-loops/types";

/** GeoJSON types */
interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

interface GeoJsonFeature {
  type: "Feature";
  geometry: GeoJsonLineString;
  properties: Record<string, unknown>;
}

interface GeoJsonLineString {
  type: "LineString";
  coordinates: [number, number][];
}

/** Color scheme for corridor types */
const CORRIDOR_TYPE_COLORS: Record<CorridorType, string> = {
  trail: "#2ecc71", // green — dedicated paths
  path: "#27ae60", // darker green — smaller paths
  "quiet-road": "#3498db", // blue — low-traffic residential
  collector: "#f39c12", // orange — medium-traffic
  arterial: "#e74c3c", // red — high-traffic
  mixed: "#9b59b6", // purple — mixed character
};

/** Connector color */
const CONNECTOR_COLOR = "#95a5a6"; // gray

/** Options for corridor GeoJSON export */
export interface CorridorGeoJsonOptions {
  /** Include connectors in the output (default: true) */
  includeConnectors?: boolean;
  /** Include only corridors of these types */
  corridorTypes?: CorridorType[];
  /** Minimum corridor length in meters to include */
  minLengthMeters?: number;
  /** Include stroke color and width properties for direct map rendering */
  includeStyle?: boolean;
  /** When set, color corridors by their score for this activity (red→yellow→green gradient) */
  scoreActivity?: ActivityType;
}

/**
 * Export a CorridorNetwork to a GeoJSON FeatureCollection.
 *
 * Each corridor becomes a LineString with properties including type, name,
 * attributes, and optional stroke styling for direct visualization.
 *
 * @param network - The corridor network to export
 * @param options - Export options
 * @returns GeoJSON FeatureCollection
 */
export function corridorNetworkToGeoJson(
  network: CorridorNetwork,
  options: CorridorGeoJsonOptions = {}
): GeoJsonFeatureCollection {
  const {
    includeConnectors = true,
    corridorTypes,
    minLengthMeters,
    includeStyle = true,
    scoreActivity,
  } = options;

  const features: GeoJsonFeature[] = [];

  // Collect filtered corridors first so we can compute score percentiles
  const filteredCorridors: Corridor[] = [];
  for (const corridor of network.corridors.values()) {
    if (corridor.geometry.length < 2) continue;
    if (corridorTypes && !corridorTypes.includes(corridor.type)) continue;
    if (
      minLengthMeters !== undefined &&
      corridor.attributes.lengthMeters < minLengthMeters
    )
      continue;
    filteredCorridors.push(corridor);
  }

  // Compute p5/p95 percentile range for score normalization
  let scoreRange: { p5: number; p95: number } | undefined;
  if (scoreActivity) {
    const scores: number[] = [];
    for (const c of filteredCorridors) {
      const s = c.scores?.[scoreActivity];
      if (s) scores.push(s.overall);
    }
    if (scores.length > 0) {
      scores.sort((a, b) => a - b);
      const p5 = scores[Math.floor(scores.length * 0.05)]!;
      const p95 = scores[Math.floor(scores.length * 0.95)]!;
      if (p95 > p5) {
        scoreRange = { p5, p95 };
      }
    }
  }

  for (const corridor of filteredCorridors) {
    features.push(corridorToFeature(corridor, includeStyle, scoreActivity, scoreRange));
  }

  if (includeConnectors) {
    for (const connector of network.connectors.values()) {
      if (connector.geometry.length < 2) continue;
      features.push(connectorToFeature(connector, includeStyle));
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

/**
 * Export only corridors (no connectors) as GeoJSON, one FeatureCollection per type.
 * Useful for layered visualization.
 */
export function corridorsByTypeToGeoJson(
  network: CorridorNetwork
): Map<CorridorType, GeoJsonFeatureCollection> {
  const byType = new Map<CorridorType, GeoJsonFeature[]>();

  for (const corridor of network.corridors.values()) {
    if (corridor.geometry.length < 2) continue;
    let list = byType.get(corridor.type);
    if (!list) {
      list = [];
      byType.set(corridor.type, list);
    }
    list.push(corridorToFeature(corridor, true));
  }

  const result = new Map<CorridorType, GeoJsonFeatureCollection>();
  for (const [type, features] of byType) {
    result.set(type, { type: "FeatureCollection", features });
  }
  return result;
}

function corridorToFeature(
  corridor: Corridor,
  includeStyle: boolean,
  scoreActivity?: ActivityType,
  scoreRange?: { p5: number; p95: number }
): GeoJsonFeature {
  const { attributes } = corridor;

  const properties: Record<string, unknown> = {
    id: corridor.id,
    featureType: "corridor",
    corridorType: corridor.type,
    name: corridor.name ?? null,
    oneWay: corridor.oneWay,
    lengthMeters: Math.round(attributes.lengthMeters),
    lengthKm: Math.round(attributes.lengthMeters / 100) / 10,
    roadClass: attributes.predominantRoadClass,
    surface: attributes.predominantSurface,
    surfaceConfidence: Math.round(attributes.surfaceConfidence * 100) / 100,
    infraContinuity:
      Math.round(attributes.infrastructureContinuity * 100) / 100,
    separationContinuity:
      Math.round(attributes.separationContinuity * 100) / 100,
    stopDensityPerKm: Math.round(attributes.stopDensityPerKm * 100) / 100,
    edgeCount: corridor.edgeIds.length,
  };

  if (attributes.averageSpeedLimit != null) {
    properties["speedLimit"] = attributes.averageSpeedLimit;
  }

  // Add score properties when scoreActivity is set
  const score =
    scoreActivity && corridor.scores?.[scoreActivity];

  if (score) {
    properties["scoreOverall"] = Math.round(score.overall * 1000) / 1000;
    properties["scoreFlow"] = Math.round(score.flow * 1000) / 1000;
    properties["scoreSafety"] = Math.round(score.safety * 1000) / 1000;
    properties["scoreSurface"] = Math.round(score.surface * 1000) / 1000;
    properties["scoreCharacter"] = Math.round(score.character * 1000) / 1000;
  }

  if (includeStyle) {
    let color: string;
    if (score) {
      let normalized = score.overall;
      if (scoreRange) {
        normalized = Math.max(0, Math.min(1,
          (score.overall - scoreRange.p5) / (scoreRange.p95 - scoreRange.p5)
        ));
      }
      color = scoreToColor(normalized);
    } else {
      color = CORRIDOR_TYPE_COLORS[corridor.type] ?? "#888888";
    }
    properties["stroke"] = color;
    properties["stroke-width"] = strokeWidthForType(corridor.type);
    properties["stroke-opacity"] = 0.85;
  }

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: corridor.geometry.map(coordToGeoJson),
    },
    properties,
  };
}

/**
 * Convert a score (0-1) to a hex color.
 * Red (#cc2222) -> Yellow (#cccc22) -> Green (#22cc22).
 *
 * Uses hex instead of HSL for maximum viewer compatibility
 * (geojson.io, QGIS, Mapbox, Kepler.gl all support hex).
 */
function scoreToColor(score: number): string {
  // Clamp to [0,1]
  const s = Math.max(0, Math.min(1, score));

  let r: number, g: number, b: number;
  if (s < 0.5) {
    // Red to Yellow: R stays high, G rises
    const t = s / 0.5;
    r = 204;
    g = Math.round(34 + t * 170); // 34 → 204
    b = 34;
  } else {
    // Yellow to Green: R drops, G stays high
    const t = (s - 0.5) / 0.5;
    r = Math.round(204 - t * 170); // 204 → 34
    g = 204;
    b = 34;
  }

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function connectorToFeature(
  connector: Connector,
  includeStyle: boolean
): GeoJsonFeature {
  const { attributes } = connector;

  const properties: Record<string, unknown> = {
    id: connector.id,
    featureType: "connector",
    lengthMeters: Math.round(attributes.lengthMeters),
    crossesMajorRoad: attributes.crossesMajorRoad,
    hasSignal: attributes.hasSignal,
    hasStop: attributes.hasStop,
    crossingDifficulty:
      Math.round(attributes.crossingDifficulty * 100) / 100,
    corridorIds: connector.corridorIds,
  };

  if (includeStyle) {
    properties["stroke"] = CONNECTOR_COLOR;
    properties["stroke-width"] = 1;
    properties["stroke-opacity"] = 0.4;
  }

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: connector.geometry.map(coordToGeoJson),
    },
    properties,
  };
}

function strokeWidthForType(type: CorridorType): number {
  switch (type) {
    case "trail":
      return 4;
    case "path":
      return 3;
    case "arterial":
      return 3;
    case "collector":
      return 2.5;
    case "quiet-road":
      return 2;
    case "mixed":
      return 2;
    default:
      return 2;
  }
}

function coordToGeoJson(coord: Coordinate): [number, number] {
  return [coord.lng, coord.lat];
}
