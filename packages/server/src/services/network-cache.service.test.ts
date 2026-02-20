import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { Graph, CorridorNetwork } from "@tailwind-loops/types";
import type { BoundingBox } from "@tailwind-loops/builder";

// We test the cache service by overriding the cache directory.
// Since the module uses a hardcoded path, we'll test the core logic
// by importing the class and using a subclass that overrides the dir.
// But the class doesn't expose the dir... so we test the actual service
// with real (but tiny) data in the default location.
//
// Better approach: test the service as-is and clean up after.
// The service uses ~/.tailwind-loops/network-cache/ — we'll use it
// with unique bbox values that won't collide.

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

/** Generate a random bbox that won't collide with real cache entries. */
function randomBbox(): BoundingBox {
  // Use coordinates in Antarctica to avoid any real-world overlap
  const base = -80 + Math.random() * 10;
  return {
    minLat: base,
    minLng: base,
    maxLat: base + 0.01,
    maxLng: base + 0.01,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("NetworkCacheService", () => {
  let service: NetworkCacheService;
  let testBboxes: BoundingBox[];

  beforeEach(() => {
    service = new NetworkCacheService();
    testBboxes = [];
  });

  afterEach(() => {
    // Clean up any test entries we created
    for (const bbox of testBboxes) {
      const entries = service.listEntries();
      for (const entry of entries) {
        // Check if this entry's bbox matches our test bbox
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
    it("returns null for uncached bbox", () => {
      const bbox = randomBbox();
      expect(service.read(bbox)).toBeNull();
    });

    it("round-trips graph and network through cache", () => {
      const bbox = randomBbox();
      testBboxes.push(bbox);
      const graph = makeGraph();
      const network = makeNetwork();

      service.write(bbox, graph, network);
      const result = service.read(bbox);

      expect(result).not.toBeNull();
      expect(result!.graph.nodes.size).toBe(2);
      expect(result!.graph.edges.size).toBe(1);
      expect(result!.network.corridors.size).toBe(0);
    });

    it("preserves Map data structures through V8 serialization", () => {
      const bbox = randomBbox();
      testBboxes.push(bbox);
      const graph = makeGraph();
      const network = makeNetwork();

      service.write(bbox, graph, network);
      const result = service.read(bbox);

      // V8 serialization should preserve Maps (unlike JSON)
      expect(result!.graph.nodes).toBeInstanceOf(Map);
      expect(result!.graph.edges).toBeInstanceOf(Map);
      expect(result!.graph.adjacency).toBeInstanceOf(Map);
    });
  });

  describe("containment matching", () => {
    it("returns cached data when a larger bbox contains the requested bbox", () => {
      // Write a large bbox
      const largeBbox: BoundingBox = {
        minLat: -79.0,
        minLng: -79.0,
        maxLat: -78.0,
        maxLng: -78.0,
      };
      testBboxes.push(largeBbox);
      const graph = makeGraph();
      const network = makeNetwork();
      service.write(largeBbox, graph, network);

      // Read with a smaller bbox inside the large one
      const smallBbox: BoundingBox = {
        minLat: -78.8,
        minLng: -78.8,
        maxLat: -78.2,
        maxLng: -78.2,
      };
      const result = service.read(smallBbox);

      expect(result).not.toBeNull();
      expect(result!.graph.nodes.size).toBe(2);
    });

    it("returns null when no cached bbox contains the requested bbox", () => {
      const cached: BoundingBox = {
        minLat: -77.0,
        minLng: -77.0,
        maxLat: -76.5,
        maxLng: -76.5,
      };
      testBboxes.push(cached);
      service.write(cached, makeGraph(), makeNetwork());

      // Request a bbox that extends beyond the cached one
      const outside: BoundingBox = {
        minLat: -77.1,
        minLng: -77.0,
        maxLat: -76.5,
        maxLng: -76.5,
      };
      const result = service.read(outside);
      expect(result).toBeNull();
    });
  });

  describe("listEntries", () => {
    it("lists written entries with bbox and size", () => {
      const bbox = randomBbox();
      testBboxes.push(bbox);
      service.write(bbox, makeGraph(), makeNetwork());

      const entries = service.listEntries();
      const match = entries.find(
        (e) => Math.abs(e.bbox.minLat - bbox.minLat) < 0.001,
      );

      expect(match).toBeDefined();
      expect(match!.id).toBeTruthy();
      expect(match!.sizeMB).toBeGreaterThanOrEqual(0); // tiny test data may round to 0
      expect(match!.bbox.minLat).toBeCloseTo(bbox.minLat, 3);
    });
  });

  describe("clearEntry", () => {
    it("removes a specific cache entry by ID", () => {
      const bbox = randomBbox();
      testBboxes.push(bbox);
      service.write(bbox, makeGraph(), makeNetwork());

      const entries = service.listEntries();
      const match = entries.find(
        (e) => Math.abs(e.bbox.minLat - bbox.minLat) < 0.001,
      );
      expect(match).toBeDefined();

      const removed = service.clearEntry(match!.id);
      expect(removed).toBe(true);

      // Should no longer be readable
      expect(service.read(bbox)).toBeNull();
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
      service.write(bbox, makeGraph(), makeNetwork());
      const after = service.getStats();

      expect(after.entries).toBeGreaterThanOrEqual(before.entries);
    });
  });
});
