/**
 * HeiGIT road surface enrichment provider.
 *
 * Reads pre-downloaded GeoPackage (GPKG) files from the HeiGIT/HDX dataset
 * containing paved/unpaved classification derived from Mapillary imagery
 * via SWIN-Transformer. Uses SQLite spatial queries to efficiently extract
 * only the features within the requested bounds.
 *
 * Features are keyed by OSM way ID for direct edge matching.
 */

import Database from "better-sqlite3";
import type {
  BoundingBox,
  EnrichableAttribute,
  Observation,
} from "@tailwind-loops/types";
import type { EnrichmentProvider } from "../provider.js";

// ---------------------------------------------------------------------------
// Row type from GPKG query
// ---------------------------------------------------------------------------

interface SurfaceRow {
  osm_id: number;
  pred_label: number; // 0 = paved, 1 = unpaved
  pred_score: number; // 0-1 confidence
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface HeiGitSurfaceProviderOptions {
  /** Path to the HeiGIT GeoPackage (.gpkg) file */
  filePath: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class HeiGitSurfaceProvider implements EnrichmentProvider {
  readonly source = "mapillary" as const; // data derived from Mapillary imagery
  readonly name = "HeiGIT Road Surface";
  readonly provides: readonly EnrichableAttribute[] = ["surface"];

  private readonly filePath: string;
  private db: Database.Database | null = null;

  constructor(options: HeiGitSurfaceProviderOptions) {
    this.filePath = options.filePath;
  }

  async fetchObservations(bounds: BoundingBox): Promise<Observation[]> {
    const db = this.open();

    // Discover the feature table and its rtree index
    const { tableName, rtreeName } = discoverTable(db);

    // Query using the GeoPackage rtree spatial index for bbox filtering,
    // then join back to the feature table for attributes.
    // Group by osm_id and pick the highest-confidence prediction per way.
    const sql = `
      SELECT
        f.osm_id,
        f.pred_label,
        f.pred_score,
        r.minx, r.miny, r.maxx, r.maxy
      FROM "${rtreeName}" r
      JOIN "${tableName}" f ON f.fid = r.id
      WHERE r.minx <= ? AND r.maxx >= ?
        AND r.miny <= ? AND r.maxy >= ?
      ORDER BY f.osm_id, f.pred_score DESC
    `;

    const rows = db.prepare(sql).all(
      bounds.maxLng, // r.minx <= maxLng
      bounds.minLng, // r.maxx >= minLng
      bounds.maxLat, // r.miny <= maxLat
      bounds.minLat, // r.maxy >= minLat
    ) as SurfaceRow[];

    // Deduplicate: keep first row per osm_id (highest pred_score due to ORDER BY)
    const bestByWayId = new Map<number, SurfaceRow>();
    for (const row of rows) {
      if (!bestByWayId.has(row.osm_id)) {
        bestByWayId.set(row.osm_id, row);
      }
    }

    // Convert to observations
    const observations: Observation[] = [];
    for (const [osmId, row] of bestByWayId) {
      const surfaceType = row.pred_label === 0 ? "paved" : "unpaved";
      // Use bbox centroid as representative geometry
      const centroidLng = (row.minx + row.maxx) / 2;
      const centroidLat = (row.miny + row.maxy) / 2;

      observations.push({
        attribute: "surface",
        source: "mapillary",
        value: surfaceType,
        sourceConfidence: row.pred_score,
        osmWayId: String(osmId),
        geometry: [{ lat: centroidLat, lng: centroidLng }],
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
 * GeoPackage stores table/column info in gpkg_contents and gpkg_geometry_columns.
 * The rtree follows the naming convention: rtree_<table>_<geom_column>.
 */
function discoverTable(db: Database.Database): {
  tableName: string;
  rtreeName: string;
} {
  // Find the first features table in gpkg_contents
  const contentsRow = db
    .prepare(
      `SELECT table_name FROM gpkg_contents WHERE data_type = 'features' LIMIT 1`
    )
    .get() as { table_name: string } | undefined;

  if (!contentsRow) {
    throw new Error("No feature table found in GeoPackage");
  }
  const tableName = contentsRow.table_name;

  // Find the geometry column for this table
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
