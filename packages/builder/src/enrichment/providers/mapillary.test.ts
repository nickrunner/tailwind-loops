import { describe, it, expect, vi } from "vitest";
import { MapillaryProvider } from "./mapillary.js";
import type { BoundingBox } from "@tailwind-loops/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_BOUNDS: BoundingBox = {
  minLat: 42.96,
  maxLat: 42.97,
  minLng: -85.67,
  maxLng: -85.66,
};

function makeMapillaryResponse(features: object[]) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ data: features }),
  } as unknown as Response;
}

function makeFeature(
  objectValue: string,
  lng: number,
  lat: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: `feat-${Math.random().toString(36).slice(2, 8)}`,
    object_type: "detection",
    object_value: objectValue,
    geometry: { type: "Point", coordinates: [lng, lat] },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("MapillaryProvider", () => {
  it("has correct metadata", () => {
    const provider = new MapillaryProvider({
      accessToken: "test-token",
      fetchFn: async () => makeMapillaryResponse([]),
    });
    expect(provider.source).toBe("mapillary");
    expect(provider.name).toBe("Mapillary Point Features");
    expect(provider.provides).toEqual(["stop-sign", "traffic-signal", "road-crossing"]);
  });

  it("maps stop sign detections", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeMapillaryResponse([
        makeFeature("regulatory--stop--g1", -85.665, 42.965),
      ])
    );

    const provider = new MapillaryProvider({
      accessToken: "test-token",
      fetchFn,
    });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.attribute).toBe("stop-sign");
    expect(obs[0]!.source).toBe("mapillary");
    expect(obs[0]!.sourceConfidence).toBe(0.7);

    const detection = obs[0]!.value as { coordinate: { lat: number; lng: number }; detectionConfidence: number };
    expect(detection.coordinate.lat).toBe(42.965);
    expect(detection.coordinate.lng).toBe(-85.665);
    expect(detection.detectionConfidence).toBe(0.75);
  });

  it("maps traffic signal detections", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeMapillaryResponse([
        makeFeature("object--traffic-signal", -85.665, 42.965),
      ])
    );

    const provider = new MapillaryProvider({
      accessToken: "test-token",
      fetchFn,
    });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.attribute).toBe("traffic-signal");
  });

  it("maps crosswalk detections", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeMapillaryResponse([
        makeFeature("marking--crosswalk--zebra", -85.665, 42.965),
      ])
    );

    const provider = new MapillaryProvider({
      accessToken: "test-token",
      fetchFn,
    });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.attribute).toBe("road-crossing");
  });

  it("ignores unrecognized detections", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeMapillaryResponse([
        makeFeature("object--fire-hydrant", -85.665, 42.965),
        makeFeature("regulatory--stop--g2", -85.665, 42.965),
      ])
    );

    const provider = new MapillaryProvider({
      accessToken: "test-token",
      fetchFn,
    });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.attribute).toBe("stop-sign");
  });

  it("subdivides large bounding boxes into tiles", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeMapillaryResponse([]));
    const largeBounds: BoundingBox = {
      minLat: 42.96,
      maxLat: 42.99, // 0.03° range → 3 tiles in lat
      minLng: -85.67,
      maxLng: -85.65, // 0.02° range → 2 tiles in lng
    };

    const provider = new MapillaryProvider({
      accessToken: "test-token",
      maxTileSizeDeg: 0.01,
      rateLimitDelayMs: 0,
      fetchFn,
    });

    await provider.fetchObservations(largeBounds);
    // 3 lat × 2 lng = 6 tiles
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it("applies rate limiting between tiles", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeMapillaryResponse([]));
    const largeBounds: BoundingBox = {
      minLat: 42.96,
      maxLat: 42.98,
      minLng: -85.67,
      maxLng: -85.65,
    };

    const startTime = Date.now();
    const provider = new MapillaryProvider({
      accessToken: "test-token",
      maxTileSizeDeg: 0.01,
      rateLimitDelayMs: 50,
      fetchFn,
    });

    await provider.fetchObservations(largeBounds);
    const elapsed = Date.now() - startTime;
    // 4 tiles, 3 delays of 50ms each = at least ~150ms
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(elapsed).toBeGreaterThanOrEqual(100); // some leeway
  });

  it("propagates API errors", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    } as Response);

    const provider = new MapillaryProvider({
      accessToken: "bad-token",
      fetchFn,
    });

    await expect(provider.fetchObservations(TEST_BOUNDS)).rejects.toThrow(
      "Mapillary API error: 403 Forbidden"
    );
  });

  it("swaps GeoJSON [lng, lat] to internal { lat, lng }", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeMapillaryResponse([
        makeFeature("regulatory--stop--g1", -85.665, 42.965),
      ])
    );

    const provider = new MapillaryProvider({
      accessToken: "test-token",
      fetchFn,
    });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    const detection = obs[0]!.value as { coordinate: { lat: number; lng: number } };
    expect(detection.coordinate.lat).toBe(42.965);
    expect(detection.coordinate.lng).toBe(-85.665);
    expect(obs[0]!.geometry![0]!.lat).toBe(42.965);
    expect(obs[0]!.geometry![0]!.lng).toBe(-85.665);
  });

  it("sets observedAt from last_seen_at", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      makeMapillaryResponse([
        makeFeature("regulatory--stop--g1", -85.665, 42.965, {
          last_seen_at: "2024-06-15T12:00:00Z",
        }),
      ])
    );

    const provider = new MapillaryProvider({
      accessToken: "test-token",
      fetchFn,
    });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs[0]!.observedAt).toEqual(new Date("2024-06-15T12:00:00Z"));
  });

  it("passes access token in URL", async () => {
    const fetchFn = vi.fn().mockResolvedValue(makeMapillaryResponse([]));
    const provider = new MapillaryProvider({
      accessToken: "my-secret-token",
      fetchFn,
    });

    await provider.fetchObservations(TEST_BOUNDS);
    const calledUrl = fetchFn.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("access_token=my-secret-token");
    expect(calledUrl).toContain("graph.mapillary.com/map_features");
  });
});
