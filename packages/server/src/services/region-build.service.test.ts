import { describe, it, expect } from "vitest";
import { bboxFromCenter, expandBbox } from "@tailwind-loops/builder";

// ─── Bbox calculation logic ─────────────────────────────────────────────────
// The RegionBuildService computes a bbox from a start coordinate and max distance.
// We test the bbox calculation logic that it relies on, since the service itself
// requires network calls. The key formula:
//   radiusKm = max(DEFAULT_RADIUS_KM=5, ceil(maxDistanceMeters/1000 / 2))
//   startBbox = bboxFromCenter(coord, radiusKm)
//   bufferedBbox = expandBbox(startBbox, 5)

describe("region bbox calculation", () => {
  const DEFAULT_RADIUS_KM = 5;

  function computeBbox(
    startCoordinate: { lat: number; lng: number },
    maxDistanceMeters: number,
  ) {
    const radiusKm = Math.max(
      DEFAULT_RADIUS_KM,
      Math.ceil((maxDistanceMeters / 1000) / 2),
    );
    const startBbox = bboxFromCenter(startCoordinate, radiusKm);
    return { bbox: expandBbox(startBbox, 5), radiusKm };
  }

  it("uses minimum 5km radius for short distances", () => {
    const { radiusKm } = computeBbox({ lat: 42.96, lng: -85.67 }, 5000);
    expect(radiusKm).toBe(5);
  });

  it("scales radius for longer distances", () => {
    // 30km max distance → radius = ceil(30/2) = 15km
    const { radiusKm } = computeBbox({ lat: 42.96, lng: -85.67 }, 30000);
    expect(radiusKm).toBe(15);
  });

  it("uses ceil for non-integer radius", () => {
    // 25km → radius = ceil(25/2) = ceil(12.5) = 13
    const { radiusKm } = computeBbox({ lat: 42.96, lng: -85.67 }, 25000);
    expect(radiusKm).toBe(13);
  });

  it("produces a bbox centered on the start coordinate", () => {
    const center = { lat: 42.96, lng: -85.67 };
    const { bbox } = computeBbox(center, 10000);

    // The bbox should be roughly centered on the coordinate
    const bboxCenterLat = (bbox.minLat + bbox.maxLat) / 2;
    const bboxCenterLng = (bbox.minLng + bbox.maxLng) / 2;

    expect(bboxCenterLat).toBeCloseTo(center.lat, 1);
    expect(bboxCenterLng).toBeCloseTo(center.lng, 1);
  });

  it("expands bbox by 5km buffer", () => {
    const center = { lat: 42.96, lng: -85.67 };
    const radiusKm = 5;
    const startBbox = bboxFromCenter(center, radiusKm);
    const buffered = expandBbox(startBbox, 5);

    // Buffered bbox should be larger in all directions
    expect(buffered.minLat).toBeLessThan(startBbox.minLat);
    expect(buffered.minLng).toBeLessThan(startBbox.minLng);
    expect(buffered.maxLat).toBeGreaterThan(startBbox.maxLat);
    expect(buffered.maxLng).toBeGreaterThan(startBbox.maxLng);
  });

  it("produces valid bbox (min < max)", () => {
    const { bbox } = computeBbox({ lat: 42.96, lng: -85.67 }, 50000);
    expect(bbox.minLat).toBeLessThan(bbox.maxLat);
    expect(bbox.minLng).toBeLessThan(bbox.maxLng);
  });
});
