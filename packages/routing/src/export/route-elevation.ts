/**
 * Build a route-level elevation profile by stitching corridor segment profiles.
 */

/** Minimal route shape required for elevation stitching — works with both server and client Route types. */
interface ElevationStitchableRoute {
  segments: ReadonlyArray<
    | { kind: "corridor"; reversed: boolean; corridor: { attributes: { elevationProfile?: number[] } } }
    | { kind: "connecting" }
  >;
}

/**
 * Stitch corridor elevation profiles into a single route-level profile.
 *
 * Iterates corridor segments in order. If a segment is traversed in reverse,
 * the profile is reversed before appending. Duplicate junction points between
 * consecutive segments are skipped.
 *
 * @returns Combined elevation samples, or null if no segments have elevation data.
 */
export function buildRouteElevationProfile(route: ElevationStitchableRoute): number[] | null {
  const profile: number[] = [];
  let hasData = false;

  for (const seg of route.segments) {
    if (seg.kind !== "corridor") continue;

    const raw = seg.corridor.attributes.elevationProfile;
    if (!raw || raw.length === 0) continue;

    hasData = true;
    const samples = seg.reversed ? [...raw].reverse() : raw;

    // Skip the first sample if it duplicates the last appended point
    const startIdx = profile.length > 0 ? 1 : 0;
    for (let i = startIdx; i < samples.length; i++) {
      profile.push(samples[i]!);
    }
  }

  return hasData ? profile : null;
}
