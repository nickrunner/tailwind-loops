/**
 * Client-side conversion of a Route object to GeoJSON for Leaflet rendering.
 *
 * Each route segment becomes a styled LineString feature.
 * A summary feature with route-level stats is also included (invisible, for popup info).
 */

import type { Route } from "@tailwind-loops/clients-react";

interface GeoJsonFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

/**
 * Convert a Route to a GeoJSON FeatureCollection for map rendering.
 */
export function routeToGeoJson(route: Route): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];
  const baseColor = "#2563eb";
  const unpavedColor = "#d97706";

  for (const seg of route.segments) {
    let surface = "unknown";
    if (seg.kind === "corridor") {
      surface = seg.corridor.attributes.predominantSurface;
    }

    const coords: [number, number][] = seg.geometry.map((c) => [c.lng, c.lat]);
    if (coords.length < 2) continue;

    const color = surface === "unpaved" ? unpavedColor : baseColor;

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {
        isSegment: true,
        surface,
        corridorName: seg.kind === "corridor" ? (seg.corridor.name ?? null) : null,
        corridorType: seg.kind === "corridor" ? seg.corridor.type : "connector",
        stroke: color,
        "stroke-width": 4,
        "stroke-opacity": 0.9,
      },
    });
  }

  // Route-level summary feature (invisible, for popup metadata)
  features.push({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: route.geometry.map((c) => [c.lng, c.lat] as [number, number]),
    },
    properties: {
      isSegment: false,
      score: Math.round(route.score * 1000) / 1000,
      distanceMeters: Math.round(route.stats.totalDistanceMeters),
      distanceKm: Math.round(route.stats.totalDistanceMeters / 100) / 10,
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

  return { type: "FeatureCollection", features };
}
