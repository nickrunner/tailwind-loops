import { scoreToColor } from "./colors.js";

function barHtml(score: number | undefined, label: string): string {
  const val = score ?? 0;
  const pct = Math.round(val * 100);
  const color = scoreToColor(val);
  return `<div><span class="bar" style="width:${pct}px;background:${color}"></span>${label}: ${val.toFixed(3)}</div>`;
}

/** Build popup HTML for a corridor feature. */
export function corridorPopupHtml(props: Record<string, unknown>): string {
  const p = props;
  const elevInfo =
    p["elevationGain"] != null
      ? `<div>Elev: +${p["elevationGain"]}m / -${p["elevationLoss"]}m | Grade: ${p["averageGrade"]}% avg, ${p["maxGrade"]}% max | Hilliness: ${p["hillinessIndex"]}</div>`
      : "";
  const elevProfile = p["elevationProfile"] as number[] | undefined;
  const elevChart =
    elevProfile && elevProfile.length > 1
      ? `<canvas class="elev-chart-canvas" width="310" height="70" style="margin-top:4px;width:310px;height:70px;" data-profile="${JSON.stringify(elevProfile)}" data-length-km="${p["lengthKm"]}"></canvas>`
      : "";

  return `
    <div class="score-popup">
      <div class="name">${p["name"] || p["id"]}</div>
      <div>Type: ${p["corridorType"]} | ${p["lengthKm"]} km</div>
      <div>Road: ${p["roadClass"]} | Surface: ${p["surface"]} (${p["surfaceConfidence"]})</div>
      <div>Infra: ${p["infraContinuity"]} | Sep: ${p["separationContinuity"]} | Stops: ${p["stopDensityPerKm"]}/km | Crossings: ${p["crossingDensityPerKm"]}/km</div>
      ${elevInfo}
      ${elevChart}
      <hr style="margin:4px 0;border-color:#555">
      ${barHtml(p["scoreOverall"] as number | undefined, "Overall")}
      ${barHtml(p["scoreFlow"] as number | undefined, "Flow")}
      ${barHtml(p["scoreSafety"] as number | undefined, "Safety")}
      ${barHtml(p["scoreSurface"] as number | undefined, "Surface")}
      ${barHtml(p["scoreCharacter"] as number | undefined, "Character")}
      ${barHtml(p["scoreScenic"] as number | undefined, "Scenic")}
      ${barHtml(p["scoreElevation"] as number | undefined, "Elevation")}
    </div>
  `;
}

/** Build popup HTML for a connector feature. */
export function connectorPopupHtml(props: Record<string, unknown>): string {
  const p = props;
  const corridorIds = p["corridorIds"] as string[] | undefined;
  return `
    <div class="score-popup">
      <div class="name">${p["id"]}</div>
      <div>Length: ${Math.round(p["lengthMeters"] as number)}m</div>
      <div>Crosses major road: ${p["crossesMajorRoad"] ? "Yes" : "No"}</div>
      <div>Signal: ${p["hasSignal"] ? "Yes" : "No"} | Stop: ${p["hasStop"] ? "Yes" : "No"}</div>
      <div>Crossing difficulty: ${p["crossingDifficulty"]}</div>
      <div>Connects: ${(corridorIds ?? []).join(", ")}</div>
    </div>
  `;
}

/** Build popup HTML for a route summary feature. */
export function routeSummaryPopupHtml(props: Record<string, unknown>): string {
  const p = props;
  const label = p["isPrimary"] ? "Primary Route" : `Alternative ${p["routeIndex"]}`;
  const distKm = p["distanceKm"] as number;
  const surfPaved = (p["surfacePaved"] as number) || 0;
  const surfUnpaved = (p["surfaceUnpaved"] as number) || 0;
  const surfUnknown = (p["surfaceUnknown"] as number) || 0;
  const total = surfPaved + surfUnpaved + surfUnknown;
  const pctPaved = total > 0 ? Math.round((surfPaved / total) * 100) : 0;
  const pctUnpaved = total > 0 ? Math.round((surfUnpaved / total) * 100) : 0;
  const pctUnknown = total > 0 ? 100 - pctPaved - pctUnpaved : 0;
  const elevGain = p["elevationGain"] as number | null;
  const elevLoss = p["elevationLoss"] as number | null;

  return `
    <div class="score-popup">
      <div class="name">${label}</div>
      <div>Distance: ${distKm} km (${(distKm * 0.621371).toFixed(1)} mi)</div>
      <div>Score: ${p["score"]} | Stops: ${p["totalStops"]} | Flow: ${p["flowScore"]}</div>
      <div>Segments: ${p["segmentCount"]}</div>
      ${elevGain != null ? `<div>Elevation: +${Math.round(elevGain * 3.28084)}ft / -${Math.round((elevLoss ?? 0) * 3.28084)}ft</div>` : ""}
      <div>Surface: ${pctPaved}% paved, ${pctUnpaved}% unpaved, ${pctUnknown}% unknown</div>
    </div>
  `;
}
