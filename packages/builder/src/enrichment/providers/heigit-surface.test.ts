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

interface GpkgFeature {
  osmId: number;
  predLabel: number | null;
  combinedSurface: string | null;
  nPredictions: number | null;
  lng: number;
  lat: number;
}

/**
 * Create a minimal GeoPackage with the HeiGIT schema and rtree spatial index.
 * Matches the actual HeiGIT/HDX GPKG schema.
 */
function createGpkg(features: GpkgFeature[]): string {
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

  // Feature table (matches actual HeiGIT schema)
  db.exec(`
    CREATE TABLE road_surface (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB,
      osm_id MEDIUMINT,
      pred_class TEXT,
      pred_label REAL,
      combined_surface_DL_priority TEXT,
      n_of_predictions_used REAL
    );
  `);

  // Register in GPKG metadata
  db.exec(`
    INSERT INTO gpkg_contents (table_name, data_type, identifier)
    VALUES ('road_surface', 'features', 'road_surface');
    INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
    VALUES ('road_surface', 'geom', 'LINESTRING', 4326, 0, 0);
  `);

  // Create rtree spatial index
  db.exec(`
    CREATE VIRTUAL TABLE rtree_road_surface_geom USING rtree(
      id, minx, maxx, miny, maxy
    );
  `);

  // Insert features
  const insertFeature = db.prepare(`
    INSERT INTO road_surface (osm_id, pred_class, pred_label, combined_surface_DL_priority, n_of_predictions_used)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertRtree = db.prepare(`
    INSERT INTO rtree_road_surface_geom (id, minx, maxx, miny, maxy) VALUES (?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((rows: GpkgFeature[]) => {
    for (const row of rows) {
      const predClass =
        row.predLabel != null
          ? row.predLabel === 0
            ? "paved"
            : "unpaved"
          : null;
      const result = insertFeature.run(
        row.osmId,
        predClass,
        row.predLabel,
        row.combinedSurface,
        row.nPredictions,
      );
      const fid = result.lastInsertRowid;
      insertRtree.run(fid, row.lng, row.lng, row.lat, row.lat);
    }
  });
  insertAll(features);

  db.close();
  return filePath;
}

// ─── GeoPackage Tests ────────────────────────────────────────────────────────

describe("HeiGitSurfaceProvider (GeoPackage)", () => {
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

  it("maps pred_label=0 to paved with ML confidence", async () => {
    const filePath = createGpkg([
      {
        osmId: 12345,
        predLabel: 0,
        combinedSurface: "paved",
        nPredictions: 7,
        lng: -85.665,
        lat: 42.965,
      },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.attribute).toBe("surface");
    expect(obs[0]!.value).toBe("paved");
    expect(obs[0]!.sourceConfidence).toBeGreaterThan(0.6);
  });

  it("maps pred_label=1 to unpaved", async () => {
    const filePath = createGpkg([
      {
        osmId: 12345,
        predLabel: 1,
        combinedSurface: "unpaved",
        nPredictions: 3,
        lng: -85.665,
        lat: 42.965,
      },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.value).toBe("unpaved");
  });

  it("falls back to combined_surface_DL_priority when no ML prediction", async () => {
    const filePath = createGpkg([
      {
        osmId: 12345,
        predLabel: null,
        combinedSurface: "unpaved",
        nPredictions: null,
        lng: -85.665,
        lat: 42.965,
      },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.value).toBe("unpaved");
    expect(obs[0]!.sourceConfidence).toBe(0.5); // lower confidence for OSM-echo
  });

  it("sets osmWayId for direct edge matching", async () => {
    const filePath = createGpkg([
      {
        osmId: 99887,
        predLabel: 0,
        combinedSurface: "paved",
        nPredictions: 5,
        lng: -85.665,
        lat: 42.965,
      },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs[0]!.osmWayId).toBe("99887");
  });

  it("deduplicates by osm_id, preferring ML predictions", async () => {
    const filePath = createGpkg([
      // OSM-only row
      {
        osmId: 12345,
        predLabel: null,
        combinedSurface: "unpaved",
        nPredictions: null,
        lng: -85.665,
        lat: 42.965,
      },
      // ML prediction row (should win)
      {
        osmId: 12345,
        predLabel: 0,
        combinedSurface: "paved",
        nPredictions: 5,
        lng: -85.665,
        lat: 42.965,
      },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.value).toBe("paved");
    expect(obs[0]!.sourceConfidence).toBeGreaterThan(0.5);
  });

  it("filters features by bounds using rtree", async () => {
    const filePath = createGpkg([
      {
        osmId: 1,
        predLabel: 0,
        combinedSurface: "paved",
        nPredictions: 5,
        lng: -85.665,
        lat: 42.965,
      }, // inside
      {
        osmId: 2,
        predLabel: 0,
        combinedSurface: "paved",
        nPredictions: 5,
        lng: -85.5,
        lat: 43.1,
      }, // outside
      {
        osmId: 3,
        predLabel: 1,
        combinedSurface: "unpaved",
        nPredictions: 3,
        lng: -85.665,
        lat: 42.965,
      }, // inside
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
    const provider = new HeiGitSurfaceProvider({
      filePath: "/nonexistent/file.gpkg",
    });
    await expect(provider.fetchObservations(TEST_BOUNDS)).rejects.toThrow();
  });

  it("skips rows with no surface data at all", async () => {
    const filePath = createGpkg([
      {
        osmId: 1,
        predLabel: null,
        combinedSurface: null,
        nPredictions: null,
        lng: -85.665,
        lat: 42.965,
      },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(0);
  });
});

// ─── Lightweight SQLite Tests ────────────────────────────────────────────────

interface LightweightRow {
  osmId: number;
  predLabel: number; // 0.0 = paved, 1.0 = unpaved
  nPredictions: number | null;
  lat: number;
  lng: number;
}

function createLightweightSqlite(rows: LightweightRow[]): string {
  const filePath = join(testDir, `surface-${Date.now()}.sqlite`);
  const db = new Database(filePath);

  db.exec(`
    CREATE TABLE surface (
      osm_id INTEGER PRIMARY KEY,
      pred_label REAL NOT NULL,
      n_predictions REAL,
      centroid_lat REAL,
      centroid_lng REAL
    )
  `);

  db.exec(`
    CREATE VIRTUAL TABLE surface_rtree USING rtree(
      id, min_lng, max_lng, min_lat, max_lat
    )
  `);

  const insertSurface = db.prepare(
    "INSERT INTO surface (osm_id, pred_label, n_predictions, centroid_lat, centroid_lng) VALUES (?, ?, ?, ?, ?)"
  );

  const insertAll = db.transaction((items: LightweightRow[]) => {
    for (const row of items) {
      insertSurface.run(
        row.osmId,
        row.predLabel,
        row.nPredictions,
        row.lat,
        row.lng,
      );
    }
  });
  insertAll(rows);

  // Populate rtree
  db.exec(`
    INSERT INTO surface_rtree (id, min_lng, max_lng, min_lat, max_lat)
    SELECT rowid, centroid_lng, centroid_lng, centroid_lat, centroid_lat
    FROM surface
    WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL
  `);

  db.close();
  return filePath;
}

describe("HeiGitSurfaceProvider (lightweight SQLite)", () => {
  beforeEach(() => {
    testDir = join(tmpdir(), `heigit-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reads paved predictions within bounds", async () => {
    const filePath = createLightweightSqlite([
      { osmId: 12345, predLabel: 0, nPredictions: 5, lat: 42.965, lng: -85.665 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.value).toBe("paved");
    expect(obs[0]!.sourceConfidence).toBeGreaterThan(0.6);
    expect(obs[0]!.osmWayId).toBe("12345");
  });

  it("reads unpaved predictions", async () => {
    const filePath = createLightweightSqlite([
      { osmId: 67890, predLabel: 1, nPredictions: 3, lat: 42.965, lng: -85.665 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(1);
    expect(obs[0]!.value).toBe("unpaved");
  });

  it("filters by bounding box using rtree", async () => {
    const filePath = createLightweightSqlite([
      { osmId: 1, predLabel: 0, nPredictions: 5, lat: 42.965, lng: -85.665 },  // inside
      { osmId: 2, predLabel: 0, nPredictions: 5, lat: 43.1, lng: -85.5 },      // outside
      { osmId: 3, predLabel: 1, nPredictions: 3, lat: 42.965, lng: -85.665 },  // inside
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(2);
    const osmIds = obs.map((o) => o.osmWayId).sort();
    expect(osmIds).toEqual(["1", "3"]);
  });

  it("assigns higher confidence for more predictions", async () => {
    const filePath = createLightweightSqlite([
      { osmId: 1, predLabel: 0, nPredictions: 1, lat: 42.965, lng: -85.665 },
      { osmId: 2, predLabel: 0, nPredictions: 10, lat: 42.965, lng: -85.665 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    const byId = new Map(obs.map((o) => [o.osmWayId, o]));
    expect(byId.get("2")!.sourceConfidence).toBeGreaterThan(
      byId.get("1")!.sourceConfidence,
    );
  });

  it("returns empty array for empty database", async () => {
    const filePath = createLightweightSqlite([]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs).toHaveLength(0);
  });

  it("does not include geometry", async () => {
    const filePath = createLightweightSqlite([
      { osmId: 1, predLabel: 0, nPredictions: 5, lat: 42.965, lng: -85.665 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations(TEST_BOUNDS);
    expect(obs[0]!.geometry).toBeUndefined();
  });

  it("returns nothing for out-of-range bounds", async () => {
    const filePath = createLightweightSqlite([
      { osmId: 1, predLabel: 0, nPredictions: 5, lat: 42.965, lng: -85.665 },
    ]);
    const provider = new HeiGitSurfaceProvider({ filePath });

    const obs = await provider.fetchObservations({
      minLat: 30, maxLat: 31, minLng: -80, maxLng: -79,
    });
    expect(obs).toHaveLength(0);
  });
});
