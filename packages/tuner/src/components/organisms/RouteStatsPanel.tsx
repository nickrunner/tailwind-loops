import type { Route, CorridorScore } from "@tailwind-loops/clients-react";
import { buildRouteElevationProfile } from "@tailwind-loops/routing/route-elevation";
import { useMemo } from "react";
import { StatRow } from "../molecules/StatRow.js";
import { ScoreBarChart } from "../molecules/ScoreBarChart.js";
import { ElevationChart } from "../molecules/ElevationChart.js";

interface RouteStatsPanelProps {
  route: Route;
  onClose: () => void;
}

const SCORE_KEYS: (keyof CorridorScore)[] = [
  "overall", "flow", "safety", "surface", "character", "scenic", "elevation",
];

function computeWeightedScores(route: Route): CorridorScore {
  let totalWeight = 0;
  const sums: Record<string, number> = {};
  for (const key of SCORE_KEYS) sums[key] = 0;

  for (const seg of route.segments) {
    if (seg.kind !== "corridor") continue;
    const score = seg.corridor.score;
    if (!score) continue;
    const weight = seg.corridor.attributes.lengthMeters;
    totalWeight += weight;
    for (const key of SCORE_KEYS) {
      sums[key]! += score[key] * weight;
    }
  }

  const result: Record<string, number> = {};
  for (const key of SCORE_KEYS) {
    result[key] = totalWeight > 0 ? sums[key]! / totalWeight : 0;
  }
  return result as unknown as CorridorScore;
}

function metersToMiles(m: number): string {
  return (m / 1609.34).toFixed(1);
}

function metersToKm(m: number): string {
  return (m / 1000).toFixed(1);
}

function metersToFeet(m: number): string {
  return Math.round(m * 3.28084).toLocaleString();
}

function pctOfTotal(value: number, total: number): string {
  if (total === 0) return "0";
  return Math.round((value / total) * 100).toString();
}

const CORRIDOR_TYPE_LABELS: Record<string, string> = {
  trail: "Trail",
  path: "Path",
  neighborhood: "Neighborhood",
  "rural-road": "Rural Road",
  collector: "Collector",
  arterial: "Arterial",
  mixed: "Mixed",
};

export function RouteStatsPanel({ route, onClose }: RouteStatsPanelProps) {
  const scores = useMemo(() => computeWeightedScores(route), [route]);
  const elevationProfile = useMemo(() => buildRouteElevationProfile(route), [route]);
  const totalDist = route.stats.totalDistanceMeters;
  const lengthKm = totalDist / 1000;
  const corridorSegments = route.segments.filter((s) => s.kind === "corridor").length;

  const surfaceDist = route.stats.distanceBySurface;
  const pavedPct = pctOfTotal(surfaceDist["paved"] ?? 0, totalDist);
  const unpavedPct = pctOfTotal(surfaceDist["unpaved"] ?? 0, totalDist);
  const unknownPct = pctOfTotal(surfaceDist["unknown"] ?? 0, totalDist);

  // Surface breakdown bar widths
  const pavedW = totalDist > 0 ? ((surfaceDist["paved"] ?? 0) / totalDist) * 100 : 0;
  const unpavedW = totalDist > 0 ? ((surfaceDist["unpaved"] ?? 0) / totalDist) * 100 : 0;
  const unknownW = totalDist > 0 ? ((surfaceDist["unknown"] ?? 0) / totalDist) * 100 : 0;

  const typeEntries = Object.entries(route.stats.distanceByCorridorType)
    .filter(([, dist]) => dist > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="route-stats-panel">
      <div className="rsp-header">
        <h2>Route Stats</h2>
        <button className="rsp-close" onClick={onClose} title="Close">&times;</button>
      </div>

      {/* Overview */}
      <div className="rsp-section">
        <h3>Overview</h3>
        <StatRow label="Distance" value={`${metersToMiles(totalDist)} mi / ${metersToKm(totalDist)} km`} />
        <StatRow label="Overall Score" value={route.score.toFixed(3)} />
        <StatRow label="Segments" value={corridorSegments} />
        <StatRow label="Stops" value={route.stats.totalStops} />
      </div>

      {/* Scoring */}
      <div className="rsp-section">
        <h3>Scoring</h3>
        <ScoreBarChart scores={scores} />
      </div>

      {/* Elevation */}
      {(route.stats.elevationGainMeters != null || elevationProfile) && (
        <div className="rsp-section">
          <h3>Elevation</h3>
          {route.stats.elevationGainMeters != null && (
            <>
              <StatRow label="Gain" value={metersToFeet(route.stats.elevationGainMeters)} unit="ft" />
              <StatRow label="Loss" value={metersToFeet(route.stats.elevationLossMeters ?? 0)} unit="ft" />
            </>
          )}
          {route.stats.maxGradePercent != null && (
            <StatRow label="Max Grade" value={route.stats.maxGradePercent.toFixed(1)} unit="%" />
          )}
          {elevationProfile && (
            <div style={{ marginTop: 8 }}>
              <ElevationChart profile={elevationProfile} lengthKm={Number(lengthKm.toFixed(1))} />
            </div>
          )}
        </div>
      )}

      {/* Surface Breakdown */}
      <div className="rsp-section">
        <h3>Surface</h3>
        <div className="surface-bar">
          {pavedW > 0 && <div className="surface-paved" style={{ width: `${pavedW}%` }} />}
          {unpavedW > 0 && <div className="surface-unpaved" style={{ width: `${unpavedW}%` }} />}
          {unknownW > 0 && <div className="surface-unknown" style={{ width: `${unknownW}%` }} />}
        </div>
        <div className="surface-legend">
          <span className="surface-dot surface-paved-dot" /> Paved {pavedPct}%
          <span className="surface-dot surface-unpaved-dot" /> Unpaved {unpavedPct}%
          <span className="surface-dot surface-unknown-dot" /> Unknown {unknownPct}%
        </div>
      </div>

      {/* Corridor Types */}
      {typeEntries.length > 0 && (
        <div className="rsp-section">
          <h3>Corridor Types</h3>
          {typeEntries.map(([type, dist]) => (
            <StatRow
              key={type}
              label={CORRIDOR_TYPE_LABELS[type] ?? type}
              value={`${metersToMiles(dist)} mi (${pctOfTotal(dist, totalDist)}%)`}
            />
          ))}
        </div>
      )}

      {/* Flow */}
      <div className="rsp-section">
        <h3>Flow</h3>
        <StatRow label="Flow Score" value={route.stats.flowScore.toFixed(2)} />
        <StatRow label="Infra Continuity" value={`${Math.round(route.stats.averageInfrastructureContinuity * 100)}%`} />
      </div>
    </div>
  );
}
