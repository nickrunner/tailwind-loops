import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HeiGitSurfaceProvider } from "./heigit-surface.js";
import type { BoundingBox } from "@tailwind-loops/types";
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_BOUNDS: BoundingBox = {
  minLat: 42.96,
  maxLat: 42.97,
  minLng: -85.67,
  maxLng: -85.66,
};

let testDir: string;

interface FeatureRow {
  osmId: number;
  predLabel: number;
  predScore: number;
  lng: number;
  lat: number;
}

/**
 * Create a minimal GeoPackage with the HeiGIT schema and rtree spatial index.
 */
function createGpkg(features: FeatureRow[]): string {
  const filePath = join(testDir, `surface-${Date.now()}.gpkg`);
  const db = new Database(filePath);

  // GeoPackage metadata tables
  db.exec(`
    CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY,
      data_type TEXT NOT NULL,
      identifier TEXT,
      description TEXT DEFAULT '',
      last_change TEXT,
      min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE,
      srs_id INTEGER
    );
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL,
      z TINYINT NOT NULL,
      m TINYINT NOT NULL,
      PRIMARY KEY (table_name, column_name)
    );
  `);

  // Feature table
  db.exec(`
    CREATE TABLE road_surface (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB,
      osm_id INTEGER,
      pred_label INTEGER,
      pred_score REAL,
      osm_tags_highway TEXT,
      osm_tags_surface TEXT
    );
  `);

  // Register in GPKG metadata
  db.exec(`
    INSERT INTO gpkg_contents (table_name, data_type, identifier)
    VALUES ('road_surface', 'features', 'road_surface');
    INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
    VALUES ('road_surface', 'geom', 'LINESTRING', 4326, 0, 0);
  `);

  // Create rtree spatial index (matches GeoPackage convention)
  db.exec(`
    CREATE VIRTUAL TABLE rtree_road_surface_geom USING rtree(
      id, minx, maxx, miny, maxy
    );
  `);

  // Insert features
  const insertFeature = db.prepare(`
    INSERT INTO road_surface (osm_id, pred_label, pred_score) VALUES (?, ?, ?)
  `);
  const insertRtree = db.prepare(`
    INSERT INTO rtree_road_surface_geom (id, minx, maxx, miny, maxy) VALUES (?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((rows: FeatureRow[]) => {
    for (const row of rows) {
      const result = insertFeature.run(row.osmId, row.predLabel, row.predScore);
      const fid = result.lastInsertRowid;
      // Use point bbox (minx=maxx, miny=maxy) for point-like features
      insertRtree.run(fid, row.lng, row.lng, row.lat, row.lat);
    }
  });
  insertAll(features);

  db.close();
  return filePath;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("HeiGitSurfaceProvider", () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `heigit-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    const filePath = createGpkg([]);
    const provider = new HeiGitSurfaceProvider({ filePath });
    expect(provider.source).toBe("mapillary");
    expect(provider.name).toBe("HeiGIT Road Surface");
    expect(provider.provides).toEqual(["surface"]);
  });

  it("maps pred_label=0 to paved", async () => {
    const filePath = createGpkg([
      { osmId: 12345, predLabel: 0, predScore: 0.95, lng: -85.665, lat: 42.965 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.attribute).toBe("surface");
    expect(obs[0]!.value).toBe("paved");
    expect(obs[0]!.sourceConfidence).toBe(0.95);
  });

  it("maps pred_label=1 to unpaved", async () => {
    const filePath = createGpkg([
      { osmId: 12345, predLabel: 1, predScore: 0.88, lng: -85.665, lat: 42.965 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.value).toBe("unpaved");
    expect(obs[0]!.sourceConfidence).toBe(0.88);
  });

  it("sets osmWayId for direct edge matching", async () => {
    const filePath = createGpkg([
      { osmId: 99887, predLabel: 0, predScore: 0.91, lng: -85.665, lat: 42.965 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs[0]!.osmWayId).toBe("99887");
  });

  it("picks highest confidence per osm_id", async () => {
    const filePath = createGpkg([
      { osmId: 12345, predLabel: 0, predScore: 0.7, lng: -85.665, lat: 42.965 },
      { osmId: 12345, predLabel: 0, predScore: 0.95, lng: -85.665, lat: 42.965 },
      { osmId: 12345, predLabel: 1, predScore: 0.8, lng: -85.665, lat: 42.965 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.sourceConfidence).toBe(0.95);
    expect(obs[0]!.value).toBe("paved");
  });

  it("filters features by bounds using rtree", async () => {
    const filePath = createGpkg([
      { osmId: 1, predLabel: 0, predScore: 0.9, lng: -85.665, lat: 42.965 }, // inside
      { osmId: 2, predLabel: 0, predScore: 0.9, lng: -85.5, lat: 43.1 },     // outside
      { osmId: 3, predLabel: 1, predScore: 0.8, lng: -85.665, lat: 42.965 }, // inside
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(2);
    const osmIds = obs.map((o) => o.osmWayId).sort();
    expect(osmIds).toEqual(["1", "3"]);
  });

  it("returns empty array for empty database", async () => {
    const filePath = createGpkg([]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(0);
  });

  it("throws for missing file", async () => {
    const provider = new HeiGitSurfaceProvider({ filePath: "/nonexistent/file.gpkg" });
    await expect(provider.fetchObservations(TEST_BOUNDS)).rejects.toThrow();
  });

  it("reuses db connection across calls", async () => {
    const filePath = createGpkg([
      { osmId: 1, predLabel: 0, predScore: 0.9, lng: -85.665, lat: 42.965 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs1 = await provider.fetchObservations(TEST_BOUNDS);
    const obs2 = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs1).toHaveLength(1);
    expect(obs2).toHaveLength(1);
  });

  it("includes geometry centroid from rtree bbox", async () => {
    const filePath = createGpkg([
      { osmId: 1, predLabel: 0, predScore: 0.9, lng: -85.665, lat: 42.965 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs[0]!.geometry).toHaveLength(1);
    expect(obs[0]!.geometry![0]!.lat).toBeCloseTo(42.965, 3);
    expect(obs[0]!.geometry![0]!.lng).toBeCloseTo(-85.665, 3);
  });
});
