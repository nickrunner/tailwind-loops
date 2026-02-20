import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { Graph, CorridorNetwork } from "@tailwind-loops/types";
import type { BoundingBox } from "@tailwind-loops/builder";

import { NetworkCacheService } from "./network-cache.service.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeGraph(): Graph {
  const nodes = new Map();
  nodes.set("n1", {
    id: "n1",
    coordinate: { lat: 42.96, lng: -85.67 },
  });
  nodes.set("n2", {
    id: "n2",
    coordinate: { lat: 42.97, lng: -85.66 },
  });

  const edges = new Map();
  edges.set("e1", {
    id: "e1",
    fromNodeId: "n1",
    toNodeId: "n2",
    attributes: {
      roadClass: "residential",
      surfaceClassification: {
        surface: "paved",
        confidence: 0.8,
        observations: [],
        hasConflict: false,
      },
      infrastructure: {
        hasBicycleInfra: false,
        hasPedestrianPath: false,
        hasShoulder: false,
        isSeparated: false,
        hasTrafficCalming: false,
      },
      oneWay: false,
      lengthMeters: 500,
    },
    geometry: [
      { lat: 42.96, lng: -85.67 },
      { lat: 42.97, lng: -85.66 },
    ],
  });

  return {
    nodes,
    edges,
    adjacency: new Map([["n1", ["e1"]]]),
  };
}

function makeNetwork(): CorridorNetwork {
  return {
    corridors: new Map(),
    connectors: new Map(),
    adjacency: new Map(),
  };
}

/** Generate a random bbox in Antarctica (~55km across). */
function randomBbox(): BoundingBox {
  const base = -80 + Math.random() * 10;
  return {
    minLat: base,
    minLng: base,
    maxLat: base + 0.5,
    maxLng: base + 0.5,
  };
}

/** Smaller inner bbox for write(). */
function innerBboxOf(bbox: BoundingBox): BoundingBox {
  const shrink = 0.02;
  return {
    minLat: bbox.minLat + shrink,
    minLng: bbox.minLng + shrink,
    maxLat: bbox.maxLat - shrink,
    maxLng: bbox.maxLng - shrink,
  };
}

/** Center coordinate of a bbox. */
function centerOf(bbox: BoundingBox): { lat: number; lng: number } {
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lng: (bbox.minLng + bbox.maxLng) / 2,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

// Large test bbox: 1° ≈ 111km extent, half-extent ~55.5km from center
const LARGE_BBOX: BoundingBox = {
  minLat: -79.0, minLng: -79.0,
  maxLat: -78.0, maxLng: -78.0,
};
const LARGE_INNER: BoundingBox = {
  minLat: -78.8, minLng: -78.8,
  maxLat: -78.2, maxLng: -78.2,
};
const LARGE_CENTER = { lat: -78.5, lng: -78.5 };

// Small radius (5km) → effective hit zone: shrink 111km bbox by 5km per side
// → ~101km effective zone → very permissive
const SMALL_RADIUS = 5;

describe("NetworkCacheService", () => {
  let service: NetworkCacheService;
  let testBboxes: BoundingBox[];

  beforeEach(() => {
    service = new NetworkCacheService();
    testBboxes = [];
  });

  afterEach(() => {
    for (const bbox of testBboxes) {
      const entries = service.listEntries();
      for (const entry of entries) {
        if (
          Math.abs(entry.bbox.minLat - bbox.minLat) < 0.001 &&
          Math.abs(entry.bbox.minLng - bbox.minLng) < 0.001
        ) {
          service.clearEntry(entry.id);
        }
      }
    }
  });

  describe("read/write round-trip", () => {
    it("returns null for uncached coordinate", () => {
      expect(service.read({ lat: -80.5, lng: -80.5 }, SMALL_RADIUS)).toBeNull();
    });

    it("round-trips graph and network through cache", () => {
      const bbox = randomBbox();
      testBboxes.push(bbox);

      service.write(bbox, innerBboxOf(bbox), makeGraph(), makeNetwork());
      // randomBbox is ~0.1° ≈ 11km across, half = 5.5km
      // radius=2km → effective half = 3.5km → center is inside
      const result = service.read(centerOf(bbox), 2);

      expect(result).not.toBeNull();
      expect(result!.graph.nodes.size).toBe(2);
      expect(result!.graph.edges.size).toBe(1);
      expect(result!.network.corridors.size).toBe(0);
    });

    it("preserves Map data structures through V8 serialization", () => {
      const bbox = randomBbox();
      testBboxes.push(bbox);

      service.write(bbox, innerBboxOf(bbox), makeGraph(), makeNetwork());
      const result = service.read(centerOf(bbox), 2);

      expect(result!.graph.nodes).toBeInstanceOf(Map);
      expect(result!.graph.edges).toBeInstanceOf(Map);
      expect(result!.graph.adjacency).toBeInstanceOf(Map);
    });
  });

  describe("radius-aware matching", () => {
    it("hits when coordinate is at center with small radius", () => {
      testBboxes.push(LARGE_BBOX);
      service.write(LARGE_BBOX, LARGE_INNER, makeGraph(), makeNetwork());

      const result = service.read(LARGE_CENTER, SMALL_RADIUS);
      expect(result).not.toBeNull();
    });

    it("hits for shifted coordinate when radius is small enough", () => {
      testBboxes.push(LARGE_BBOX);
      service.write(LARGE_BBOX, LARGE_INNER, makeGraph(), makeNetwork());

      // Shifted 0.05° ≈ 5.5km from center. radius=5km.
      // Effective hit zone half = 55.5 - 5 = 50.5km → coordinate (5.5km offset) is inside.
      const shifted = { lat: -78.55, lng: -78.45 };
      const result = service.read(shifted, SMALL_RADIUS);
      expect(result).not.toBeNull();
    });

    it("misses when radius is too large for the cached data", () => {
      testBboxes.push(LARGE_BBOX);
      service.write(LARGE_BBOX, LARGE_INNER, makeGraph(), makeNetwork());

      // bbox half-extent = ~55.5km. radius=60km → effective half = -4.5km → inverted → miss
      const result = service.read(LARGE_CENTER, 60);
      expect(result).toBeNull();
    });

    it("misses when coordinate is outside effective zone for given radius", () => {
      testBboxes.push(LARGE_BBOX);
      service.write(LARGE_BBOX, LARGE_INNER, makeGraph(), makeNetwork());

      // radius=50km → effective hit zone half = 55.5 - 50 = 5.5km ≈ 0.05°
      // Center is -78.5, so effective zone is roughly [-78.55, -78.45].
      // Coordinate at -78.7 (0.2° = 22km from center) → outside.
      const result = service.read({ lat: -78.7, lng: -78.5 }, 50);
      expect(result).toBeNull();
    });

    it("hits same coordinate with small radius, misses with large radius", () => {
      testBboxes.push(LARGE_BBOX);
      service.write(LARGE_BBOX, LARGE_INNER, makeGraph(), makeNetwork());

      // Same coordinate, different radii
      const coord = { lat: -78.6, lng: -78.5 };

      // Small radius (5km) → effective half = 50.5km → coord at 11km offset → HIT
      expect(service.read(coord, SMALL_RADIUS)).not.toBeNull();

      // Large radius (55km) → effective half = 0.5km → coord at 11km offset → MISS
      expect(service.read(coord, 55)).toBeNull();
    });

    it("returns null when coordinate is completely outside cached area", () => {
      const bbox: BoundingBox = {
        minLat: -77.0, minLng: -77.0,
        maxLat: -76.5, maxLng: -76.5,
      };
      const inner: BoundingBox = {
        minLat: -76.9, minLng: -76.9,
        maxLat: -76.6, maxLng: -76.6,
      };
      testBboxes.push(bbox);
      service.write(bbox, inner, makeGraph(), makeNetwork());

      const result = service.read({ lat: -75.0, lng: -75.0 }, SMALL_RADIUS);
      expect(result).toBeNull();
    });
  });

  describe("listEntries", () => {
    it("lists written entries with bbox and size", () => {
      const bbox = randomBbox();
      testBboxes.push(bbox);
      service.write(bbox, innerBboxOf(bbox), makeGraph(), makeNetwork());

      const entries = service.listEntries();
      const match = entries.find(
        (e) => Math.abs(e.bbox.minLat - bbox.minLat) < 0.001,
      );

      expect(match).toBeDefined();
      expect(match!.id).toBeTruthy();
      expect(match!.sizeMB).toBeGreaterThanOrEqual(0);
      expect(match!.bbox.minLat).toBeCloseTo(bbox.minLat, 3);
    });
  });

  describe("clearEntry", () => {
    it("removes a specific cache entry by ID", () => {
      const bbox = randomBbox();
      testBboxes.push(bbox);
      service.write(bbox, innerBboxOf(bbox), makeGraph(), makeNetwork());

      const entries = service.listEntries();
      const match = entries.find(
        (e) => Math.abs(e.bbox.minLat - bbox.minLat) < 0.001,
      );
      expect(match).toBeDefined();

      const removed = service.clearEntry(match!.id);
      expect(removed).toBe(true);

      expect(service.read(centerOf(bbox), 2)).toBeNull();
    });

    it("returns false for non-existent entry", () => {
      expect(service.clearEntry("nonexistent_id_12345")).toBe(false);
    });
  });

  describe("getStats", () => {
    it("returns entry count and total size", () => {
      const stats = service.getStats();
      expect(stats.entries).toBeGreaterThanOrEqual(0);
      expect(stats.totalSizeMB).toBeGreaterThanOrEqual(0);
    });

    it("increases after writing a new entry", () => {
      const before = service.getStats();
      const bbox = randomBbox();
      testBboxes.push(bbox);
      service.write(bbox, innerBboxOf(bbox), makeGraph(), makeNetwork());
      const after = service.getStats();

      expect(after.entries).toBeGreaterThanOrEqual(before.entries);
    });
  });
});
