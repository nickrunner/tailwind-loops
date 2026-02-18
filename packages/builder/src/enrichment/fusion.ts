/**
 * Per-attribute fusion strategies.
 *
 * Each strategy knows how to combine multiple observations of the same
 * attribute into a single resolved value with confidence.
 */

import type {
  AttributeValueMap,
  DataSource,
  EnrichableAttribute,
  Observation,
  PointDetection,
  SurfaceType,
} from "@tailwind-loops/types";
import { fuseSurfaceObservations } from "../ingestion/index.js";

// ---------------------------------------------------------------------------
// Fusion result
// ---------------------------------------------------------------------------

export interface FusionResult<A extends EnrichableAttribute> {
  value: AttributeValueMap[A];
  confidence: number;
  hasConflict: boolean;
}

// ---------------------------------------------------------------------------
// Fusion strategy interface
// ---------------------------------------------------------------------------

export interface FusionStrategy<A extends EnrichableAttribute> {
  readonly attribute: A;
  readonly sourceWeights: Partial<Record<DataSource, number>>;
  fuse(observations: Observation<A>[]): FusionResult<A>;
}

// ---------------------------------------------------------------------------
// Surface fusion (wraps existing fuseSurfaceObservations)
// ---------------------------------------------------------------------------

const SURFACE_SOURCE_TO_LEGACY: Partial<Record<DataSource, import("@tailwind-loops/types").SurfaceDataSource>> = {
  "osm-tag": "osm-surface-tag",
  "osm-inferred": "osm-highway-inferred",
  "gravelmap": "gravelmap",
  "user-report": "user-report",
};

export class SurfaceFusionStrategy implements FusionStrategy<"surface"> {
  readonly attribute = "surface" as const;
  readonly sourceWeights: Partial<Record<DataSource, number>> = {
    "gravelmap": 0.9,
    "osm-tag": 0.7,
    "mapillary": 0.65,
    "osm-inferred": 0.2,
  };

  fuse(observations: Observation<"surface">[]): FusionResult<"surface"> {
    // Convert to legacy SurfaceObservation and delegate
    const legacyObs = observations.map((obs) => ({
      source: SURFACE_SOURCE_TO_LEGACY[obs.source] ?? ("osm-surface-tag" as const),
      surface: obs.value as SurfaceType,
      sourceConfidence: obs.sourceConfidence,
      observedAt: obs.observedAt,
    }));

    const result = fuseSurfaceObservations(legacyObs);

    return {
      value: result.surface,
      confidence: result.confidence,
      hasConflict: result.hasConflict,
    };
  }
}

// ---------------------------------------------------------------------------
// Speed limit fusion (weighted median)
// ---------------------------------------------------------------------------

export class SpeedLimitFusionStrategy implements FusionStrategy<"speed-limit"> {
  readonly attribute = "speed-limit" as const;
  readonly sourceWeights: Partial<Record<DataSource, number>> = {
    "municipal-open-data": 0.9,
    "google-roads": 0.85,
    "osm-tag": 0.8,
    "mapillary": 0.75,
    "osm-inferred": 0.15,
  };

  fuse(observations: Observation<"speed-limit">[]): FusionResult<"speed-limit"> {
    if (observations.length === 0) {
      return { value: 0, confidence: 0, hasConflict: false };
    }

    // Build weighted entries
    const entries = observations.map((obs) => ({
      value: obs.value as number,
      weight: (this.sourceWeights[obs.source] ?? 0.5) * obs.sourceConfidence,
    }));

    // Sort by value for weighted median
    entries.sort((a, b) => a.value - b.value);

    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    const halfWeight = totalWeight / 2;

    // Weighted median
    let cumWeight = 0;
    let median = entries[0]!.value;
    for (const entry of entries) {
      cumWeight += entry.weight;
      if (cumWeight >= halfWeight) {
        median = entry.value;
        break;
      }
    }

    // Conflict: if spread > 20 km/h among significant sources
    const maxVal = Math.max(...entries.map((e) => e.value));
    const minVal = Math.min(...entries.map((e) => e.value));
    const hasConflict = maxVal - minVal > 20;

    // Confidence based on source count + quality
    const confidence = Math.min(
      0.95,
      Math.min(observations.length / 2, 1) * 0.4 +
        (totalWeight / observations.length) * 0.6
    );

    return { value: median, confidence, hasConflict };
  }
}

// ---------------------------------------------------------------------------
// Point detection fusion (stop signs, traffic signals, road crossings)
// Spatial deduplication + count within 15m proximity radius
// ---------------------------------------------------------------------------

export class PointDetectionFusionStrategy<
  A extends "stop-sign" | "traffic-signal" | "road-crossing"
> implements FusionStrategy<A>
{
  readonly attribute: A;
  readonly sourceWeights: Partial<Record<DataSource, number>> = {
    "municipal-open-data": 0.9,
    "osm-tag": 0.8,
    "mapillary": 0.7,
  };

  constructor(attribute: A) {
    this.attribute = attribute;
  }

  fuse(observations: Observation<A>[]): FusionResult<A> {
    if (observations.length === 0) {
      return {
        value: { coordinate: { lat: 0, lng: 0 }, detectionConfidence: 0 } as AttributeValueMap[A],
        confidence: 0,
        hasConflict: false,
      };
    }

    // Spatially deduplicate within 15m
    const detections = observations.map((obs) => obs.value as PointDetection);
    const clusters = this.spatialDedup(detections, 15);

    // Pick the cluster with the highest aggregate confidence
    let bestCluster = clusters[0]!;
    let bestWeight = 0;
    for (const cluster of clusters) {
      const w = cluster.reduce((s, d) => s + d.detectionConfidence, 0);
      if (w > bestWeight) {
        bestWeight = w;
        bestCluster = cluster;
      }
    }

    // Average coordinate of best cluster
    const avgLat =
      bestCluster.reduce((s, d) => s + d.coordinate.lat, 0) /
      bestCluster.length;
    const avgLng =
      bestCluster.reduce((s, d) => s + d.coordinate.lng, 0) /
      bestCluster.length;
    const avgConf =
      bestCluster.reduce((s, d) => s + d.detectionConfidence, 0) /
      bestCluster.length;

    // Multi-source agreement increases confidence
    const sourceCount = new Set(observations.map((o) => o.source)).size;
    const confidence = Math.min(0.95, avgConf * 0.5 + Math.min(sourceCount / 2, 1) * 0.5);

    return {
      value: {
        coordinate: { lat: avgLat, lng: avgLng },
        detectionConfidence: avgConf,
      } as AttributeValueMap[A],
      confidence,
      hasConflict: false,
    };
  }

  private spatialDedup(
    detections: PointDetection[],
    radiusMeters: number
  ): PointDetection[][] {
    const used = new Set<number>();
    const clusters: PointDetection[][] = [];

    for (let i = 0; i < detections.length; i++) {
      if (used.has(i)) continue;
      const cluster = [detections[i]!];
      used.add(i);

      for (let j = i + 1; j < detections.length; j++) {
        if (used.has(j)) continue;
        if (this.distance(detections[i]!, detections[j]!) < radiusMeters) {
          cluster.push(detections[j]!);
          used.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  private distance(a: PointDetection, b: PointDetection): number {
    const midLat =
      ((a.coordinate.lat + b.coordinate.lat) / 2) * (Math.PI / 180);
    const dx =
      (a.coordinate.lng - b.coordinate.lng) *
      111_320 *
      Math.cos(midLat);
    const dy = (a.coordinate.lat - b.coordinate.lat) * 111_320;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

// ---------------------------------------------------------------------------
// Boolean fusion (bicycle-infra, traffic-calming)
// Weighted boolean majority vote
// ---------------------------------------------------------------------------

export class BooleanFusionStrategy<
  A extends "bicycle-infra" | "traffic-calming"
> implements FusionStrategy<A>
{
  readonly attribute: A;
  readonly sourceWeights: Partial<Record<DataSource, number>> = {
    "municipal-open-data": 0.9,
    "osm-tag": 0.7,
    "mapillary": 0.6,
  };

  constructor(attribute: A) {
    this.attribute = attribute;
  }

  fuse(observations: Observation<A>[]): FusionResult<A> {
    if (observations.length === 0) {
      return { value: false as AttributeValueMap[A], confidence: 0, hasConflict: false };
    }

    let trueWeight = 0;
    let falseWeight = 0;

    for (const obs of observations) {
      const weight = (this.sourceWeights[obs.source] ?? 0.5) * obs.sourceConfidence;
      if (obs.value) {
        trueWeight += weight;
      } else {
        falseWeight += weight;
      }
    }

    const totalWeight = trueWeight + falseWeight;
    const winner = trueWeight >= falseWeight;
    const majority = winner ? trueWeight : falseWeight;
    const agreement = totalWeight > 0 ? majority / totalWeight : 0;

    const hasConflict = agreement < 0.7;
    const confidence = Math.min(
      0.95,
      agreement * 0.5 + Math.min(observations.length / 2, 1) * 0.5
    );

    return {
      value: winner as AttributeValueMap[A],
      confidence,
      hasConflict,
    };
  }
}

// ---------------------------------------------------------------------------
// Numeric fusion (scenic)
// Weighted average
// ---------------------------------------------------------------------------

export class NumericFusionStrategy implements FusionStrategy<"scenic"> {
  readonly attribute = "scenic" as const;
  readonly sourceWeights: Partial<Record<DataSource, number>> = {
    "user-report": 0.85,
    "osm-tag": 0.7,
  };

  fuse(observations: Observation<"scenic">[]): FusionResult<"scenic"> {
    if (observations.length === 0) {
      return { value: 0, confidence: 0, hasConflict: false };
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const obs of observations) {
      const weight = (this.sourceWeights[obs.source] ?? 0.5) * obs.sourceConfidence;
      weightedSum += (obs.value as number) * weight;
      totalWeight += weight;
    }

    const value = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Conflict: high variance among observations
    const values = observations.map((o) => o.value as number);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const hasConflict = variance > 0.1;

    const confidence = Math.min(
      0.95,
      Math.min(observations.length / 2, 1) * 0.4 +
        (totalWeight / observations.length) * 0.6
    );

    return { value, confidence, hasConflict };
  }
}

// ---------------------------------------------------------------------------
// Fusion registry
// ---------------------------------------------------------------------------

export type AnyFusionStrategy = FusionStrategy<EnrichableAttribute>;

/** Create the default set of fusion strategies */
export function createDefaultStrategies(): Map<EnrichableAttribute, AnyFusionStrategy> {
  const strategies = new Map<EnrichableAttribute, AnyFusionStrategy>();

  strategies.set("surface", new SurfaceFusionStrategy());
  strategies.set("speed-limit", new SpeedLimitFusionStrategy());
  strategies.set("stop-sign", new PointDetectionFusionStrategy("stop-sign"));
  strategies.set("traffic-signal", new PointDetectionFusionStrategy("traffic-signal"));
  strategies.set("road-crossing", new PointDetectionFusionStrategy("road-crossing"));
  strategies.set("bicycle-infra", new BooleanFusionStrategy("bicycle-infra"));
  strategies.set("traffic-calming", new BooleanFusionStrategy("traffic-calming"));
  strategies.set("scenic", new NumericFusionStrategy());

  return strategies;
}
