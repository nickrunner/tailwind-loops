/**
 * HeiGIT road surface enrichment provider.
 *
 * Supports two file formats:
 *
 * 1. **Lightweight SQLite** (.sqlite) — Produced by scripts/download-heigit-surface.py.
 *    Contains ML-predicted surface classifications per OSM way ID with centroid
 *    coordinates and an rtree spatial index for efficient bbox queries.
 *    This is the recommended format (~300-500MB vs ~100GB for full GPKG dataset).
 *
 * 2. **GeoPackage** (.gpkg) — Raw HeiGIT/HDX files with full road geometry.
 *    Uses GeoPackage rtree spatial index for bbox filtering.
 *
 * Data is paved/unpaved classification derived from Mapillary street-level imagery
 * via SWIN-Transformer. Features are keyed by OSM way ID for direct edge matching.
 *
 * HeiGIT GPKG schema (relevant columns):
 *   osm_id — OSM way ID
 *   pred_class — "paved" or "unpaved" (NULL if no ML prediction)
 *   pred_label — 0.0 = paved, 1.0 = unpaved (NULL if no ML prediction)
 *   n_of_predictions_used — number of Mapillary images used
 *   combined_surface_DL_priority — merged ML + OSM surface classification
 */

import Database from "better-sqlite3";
import type {
  BoundingBox,
  EnrichableAttribute,
  Observation,
} from "@tailwind-loops/types";
import type { EnrichmentProvider } from "../provider.js";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

/** Row from the lightweight SQLite DB */
interface LightweightRow {
  osm_id: number;
  pred_label: number; // 0.0 = paved, 1.0 = unpaved
  n_predictions: number | null; // number of Mapillary images used
}

/** Row from a raw GeoPackage with rtree bbox */
interface GpkgRow {
  osm_id: number;
  pred_label: number | null; // 0.0 = paved, 1.0 = unpaved, NULL if no ML prediction
  combined_surface_DL_priority: string | null; // "paved", "unpaved", or NULL
  n_of_predictions_used: number | null;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface HeiGitSurfaceProviderOptions {
  /** Path to a HeiGIT .sqlite (lightweight) or .gpkg (full GeoPackage) file */
  filePath: string;
}

// ---------------------------------------------------------------------------
// Confidence heuristics
// ---------------------------------------------------------------------------

/**
 * Derive a confidence score from the number of Mapillary images used.
 * More images = more reliable prediction.
 */
function confidenceFromPredictionCount(n: number | null): number {
  if (n == null || n <= 0) return 0.6;
  if (n >= 10) return 0.9;
  // Linear interpolation: 1 prediction → 0.65, 10 → 0.9
  return 0.6 + 0.03 * Math.min(n, 10);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class HeiGitSurfaceProvider implements EnrichmentProvider {
  readonly source = "mapillary" as const; // data derived from Mapillary imagery
  readonly name = "HeiGIT Road Surface";
  readonly provides: readonly EnrichableAttribute[] = ["surface"];

  private readonly filePath: string;
  private readonly isLightweight: boolean;
  private db: Database.Database | null = null;

  constructor(options: HeiGitSurfaceProviderOptions) {
    this.filePath = options.filePath;
    this.isLightweight = options.filePath.endsWith(".sqlite");
  }

  async fetchObservations(bounds: BoundingBox): Promise<Observation[]> {
    if (this.isLightweight) {
      return this.fetchFromLightweight(bounds);
    }
    return this.fetchFromGpkg(bounds);
  }

  /**
   * Lightweight SQLite: query using rtree spatial index on centroid coordinates.
   * All rows have ML predictions (OSM-only rows are filtered during download).
   */
  private fetchFromLightweight(bounds: BoundingBox): Observation[] {
    const db = this.open();

    const hasRtree = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='surface_rtree'"
      )
      .get();

    let rows: LightweightRow[];
    if (hasRtree) {
      rows = db
        .prepare(
          `SELECT s.osm_id, s.pred_label, s.n_predictions
           FROM surface_rtree r
           JOIN surface s ON s.rowid = r.id
           WHERE r.min_lng <= ? AND r.max_lng >= ?
             AND r.min_lat <= ? AND r.max_lat >= ?`
        )
        .all(
          bounds.maxLng,
          bounds.minLng,
          bounds.maxLat,
          bounds.minLat,
        ) as LightweightRow[];
    } else {
      // Fallback: simple WHERE on centroid columns
      rows = db
        .prepare(
          `SELECT osm_id, pred_label, n_predictions FROM surface
           WHERE centroid_lat >= ? AND centroid_lat <= ?
             AND centroid_lng >= ? AND centroid_lng <= ?`
        )
        .all(
          bounds.minLat,
          bounds.maxLat,
          bounds.minLng,
          bounds.maxLng,
        ) as LightweightRow[];
    }

    return rows.map((row) => ({
      attribute: "surface" as const,
      source: "mapillary" as const,
      value: row.pred_label === 0 ? ("paved" as const) : ("unpaved" as const),
      sourceConfidence: confidenceFromPredictionCount(row.n_predictions),
      osmWayId: String(row.osm_id),
    }));
  }

  /**
   * GeoPackage: use GeoPackage rtree spatial index for bbox filtering.
   * Extracts ML predictions where available, falls back to combined surface.
   */
  private fetchFromGpkg(bounds: BoundingBox): Observation[] {
    const db = this.open();
    const { tableName, rtreeName } = discoverGpkgTable(db);

    const sql = `
      SELECT
        f.osm_id,
        f.pred_label,
        f.combined_surface_DL_priority,
        f.n_of_predictions_used
      FROM "${rtreeName}" r
      JOIN "${tableName}" f ON f.fid = r.id
      WHERE r.minx <= ? AND r.maxx >= ?
        AND r.miny <= ? AND r.maxy >= ?
        AND (f.pred_label IS NOT NULL OR f.combined_surface_DL_priority IS NOT NULL)
    `;

    const rows = db.prepare(sql).all(
      bounds.maxLng,
      bounds.minLng,
      bounds.maxLat,
      bounds.minLat,
    ) as GpkgRow[];

    // Deduplicate by osm_id: prefer rows with ML predictions, then by n_of_predictions_used
    const bestByWayId = new Map<number, GpkgRow>();
    for (const row of rows) {
      const existing = bestByWayId.get(row.osm_id);
      if (!existing) {
        bestByWayId.set(row.osm_id, row);
      } else {
        const existingHasMl = existing.pred_label != null;
        const newHasMl = row.pred_label != null;
        if (
          (newHasMl && !existingHasMl) ||
          (newHasMl === existingHasMl &&
            (row.n_of_predictions_used ?? 0) >
              (existing.n_of_predictions_used ?? 0))
        ) {
          bestByWayId.set(row.osm_id, row);
        }
      }
    }

    const observations: Observation[] = [];
    for (const [, row] of bestByWayId) {
      let surfaceType: "paved" | "unpaved";
      let confidence: number;

      if (row.pred_label != null) {
        // ML prediction available
        surfaceType = row.pred_label === 0 ? "paved" : "unpaved";
        confidence = confidenceFromPredictionCount(row.n_of_predictions_used);
      } else if (row.combined_surface_DL_priority) {
        // OSM-derived only
        surfaceType =
          row.combined_surface_DL_priority === "paved" ? "paved" : "unpaved";
        confidence = 0.5; // Lower confidence for OSM-echo data
      } else {
        continue;
      }

      observations.push({
        attribute: "surface",
        source: "mapillary",
        value: surfaceType,
        sourceConfidence: confidence,
        osmWayId: String(row.osm_id),
      });
    }

    return observations;
  }

  private open(): Database.Database {
    if (this.db) return this.db;
    this.db = new Database(this.filePath, { readonly: true });
    return this.db;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Discover the feature table name and its rtree index from GPKG metadata.
 */
function discoverGpkgTable(db: Database.Database): {
  tableName: string;
  rtreeName: string;
} {
  const contentsRow = db
    .prepare(
      `SELECT table_name FROM gpkg_contents WHERE data_type = 'features' LIMIT 1`
    )
    .get() as { table_name: string } | undefined;

  if (!contentsRow) {
    throw new Error("No feature table found in GeoPackage");
  }
  const tableName = contentsRow.table_name;

  const geomRow = db
    .prepare(
      `SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ?`
    )
    .get(tableName) as { column_name: string } | undefined;

  if (!geomRow) {
    throw new Error(`No geometry column found for table "${tableName}"`);
  }

  const rtreeName = `rtree_${tableName}_${geomRow.column_name}`;
  return { tableName, rtreeName };
}
