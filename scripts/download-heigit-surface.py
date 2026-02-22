#!/usr/bin/env python3
"""
Download HeiGIT road surface classification data and extract a lightweight
lookup table of ML-predicted surface types (paved/unpaved) per OSM way ID.

The full US dataset is ~100GB across 40 GeoPackage files, each containing
full road geometries + surface predictions derived from Mapillary street-level
imagery via SWIN-Transformer.

Most rows (~87%) have no ML prediction and just echo OSM surface tags, which
our graph builder already ingests directly. This script extracts ONLY the rows
with actual ML predictions (~13% of data), producing a small, high-value
SQLite DB with an rtree spatial index for bbox queries.

Source: https://data.humdata.org/dataset/united-states-of-america-road-surface-data

Usage:
  python3 scripts/download-heigit-surface.py             # Download all 40 files
  python3 scripts/download-heigit-surface.py 39           # Download only file 39
  python3 scripts/download-heigit-surface.py 0 5          # Download files 0 through 5
  python3 scripts/download-heigit-surface.py --out DIR    # Custom output directory

Expected output: ~300-500MB SQLite file (vs ~100GB for raw GPKGs).
Resumable — tracks which files have been processed.
"""

import argparse
import os
import sqlite3
import subprocess
import tempfile
import time

BASE_URL = "https://warm.storage.heigit.org/heigit-hdx-public/mapillary_road_surface_missing_countries"
NUM_FILES = 40

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download and extract HeiGIT road surface ML predictions.",
    )
    parser.add_argument(
        "files",
        nargs="*",
        type=int,
        help="File number(s) to download (0-39). "
        "One number downloads that file; two numbers downloads a range (inclusive). "
        "Omit to download all 40 files.",
    )
    parser.add_argument(
        "--out",
        default=os.path.join(ROOT_DIR, "data", "surface"),
        help="Output directory (default: data/surface/)",
    )
    args = parser.parse_args()

    # Resolve file range
    if len(args.files) == 0:
        args.file_range = range(NUM_FILES)
    elif len(args.files) == 1:
        n = args.files[0]
        if not 0 <= n < NUM_FILES:
            parser.error(f"File number must be 0-{NUM_FILES - 1}, got {n}")
        args.file_range = range(n, n + 1)
    elif len(args.files) == 2:
        lo, hi = args.files
        if not (0 <= lo < NUM_FILES and 0 <= hi < NUM_FILES):
            parser.error(f"File numbers must be 0-{NUM_FILES - 1}")
        args.file_range = range(lo, hi + 1)
    else:
        parser.error("Provide at most two file numbers (start and end of range)")

    return args


def discover_gpkg_table(db_path: str) -> tuple[str, str]:
    """Find the feature table name and rtree index name in a GeoPackage."""
    conn = sqlite3.connect(db_path)

    row = conn.execute(
        "SELECT table_name FROM gpkg_contents WHERE data_type = 'features' LIMIT 1"
    ).fetchone()
    if not row:
        conn.close()
        raise RuntimeError(f"No feature table found in {db_path}")
    table_name = row[0]

    geom_row = conn.execute(
        "SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ?",
        (table_name,),
    ).fetchone()
    conn.close()
    if not geom_row:
        raise RuntimeError(f"No geometry column found for table '{table_name}'")

    rtree_name = f"rtree_{table_name}_{geom_row[0]}"
    return table_name, rtree_name


def extract_surface_data(gpkg_path: str, out_conn: sqlite3.Connection) -> tuple[int, int]:
    """
    Extract ML-predicted surface data from a GPKG into the output DB.
    Returns (total_rows_scanned, ml_rows_extracted).
    """
    table_name, rtree_name = discover_gpkg_table(gpkg_path)

    gpkg_conn = sqlite3.connect(gpkg_path)

    # Only extract rows with ML predictions (pred_class IS NOT NULL).
    # These are the high-value rows — roads classified from Mapillary imagery.
    # Rows without ML predictions just echo OSM surface tags we already have.
    #
    # Schema columns used:
    #   osm_id — OSM way ID
    #   pred_class — ML prediction: "paved" or "unpaved" (NULL if no prediction)
    #   pred_label — 0.0 = paved, 1.0 = unpaved (NULL if no prediction)
    #   n_of_predictions_used — number of Mapillary images used for prediction
    #   rtree centroid — representative coordinate for spatial indexing
    sql = f"""
        SELECT
            f.osm_id,
            f.pred_label,
            f.n_of_predictions_used,
            (r.miny + r.maxy) / 2.0 AS centroid_lat,
            (r.minx + r.maxx) / 2.0 AS centroid_lng
        FROM "{table_name}" f
        JOIN "{rtree_name}" r ON r.id = f.fid
        WHERE f.pred_class IS NOT NULL
    """
    cursor = gpkg_conn.execute(sql)

    # Also count total rows
    total = gpkg_conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]

    batch: list[tuple] = []
    ml_count = 0
    while True:
        rows = cursor.fetchmany(50_000)
        if not rows:
            break
        batch.extend(rows)
        ml_count += len(rows)

        if len(batch) >= 50_000:
            _insert_batch(out_conn, batch)
            batch.clear()

    if batch:
        _insert_batch(out_conn, batch)

    gpkg_conn.close()
    return total, ml_count


def _insert_batch(out_conn: sqlite3.Connection, batch: list[tuple]) -> None:
    """Insert a batch of (osm_id, pred_label, n_predictions, lat, lng) rows."""
    # Higher n_of_predictions_used wins on conflict (more Mapillary images = more reliable)
    out_conn.executemany(
        """INSERT INTO surface (osm_id, pred_label, n_predictions, centroid_lat, centroid_lng)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(osm_id) DO UPDATE SET
             pred_label = CASE WHEN excluded.n_predictions > surface.n_predictions
                               THEN excluded.pred_label ELSE surface.pred_label END,
             n_predictions = MAX(surface.n_predictions, excluded.n_predictions),
             centroid_lat = CASE WHEN excluded.n_predictions > surface.n_predictions
                                 THEN excluded.centroid_lat ELSE surface.centroid_lat END,
             centroid_lng = CASE WHEN excluded.n_predictions > surface.n_predictions
                                 THEN excluded.centroid_lng ELSE surface.centroid_lng END
        """,
        batch,
    )
    out_conn.commit()


def build_rtree_index(conn: sqlite3.Connection) -> None:
    """Build an rtree spatial index from the surface table's centroid coordinates."""
    print("Building rtree spatial index ...")

    conn.execute("DROP TABLE IF EXISTS surface_rtree")
    conn.execute("""
        CREATE VIRTUAL TABLE surface_rtree USING rtree(
            id,
            min_lng, max_lng,
            min_lat, max_lat
        )
    """)

    conn.execute("""
        INSERT INTO surface_rtree (id, min_lng, max_lng, min_lat, max_lat)
        SELECT rowid, centroid_lng, centroid_lng, centroid_lat, centroid_lat
        FROM surface
        WHERE centroid_lat IS NOT NULL AND centroid_lng IS NOT NULL
    """)
    conn.commit()
    print("  rtree index built.")


def download_file(url: str, dest: str) -> bool:
    """Download a file using curl. Returns True on success."""
    result = subprocess.run(
        ["curl", "-fSL", "--progress-bar", "-o", dest, url],
        capture_output=False,
    )
    return result.returncode == 0


def format_size(path: str) -> str:
    """Human-readable file size."""
    size = os.path.getsize(path)
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def main():
    args = parse_args()
    out_dir = args.out
    output_db = os.path.join(out_dir, "heigit-surface.sqlite")
    file_range = args.file_range

    os.makedirs(out_dir, exist_ok=True)

    out_conn = sqlite3.connect(output_db)
    out_conn.execute("""
        CREATE TABLE IF NOT EXISTS surface (
            osm_id INTEGER PRIMARY KEY,
            pred_label REAL NOT NULL,
            n_predictions REAL,
            centroid_lat REAL,
            centroid_lng REAL
        )
    """)
    out_conn.execute("""
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    out_conn.commit()

    # Check which files have already been processed
    processed = set()
    for row in out_conn.execute(
        "SELECT value FROM metadata WHERE key LIKE 'processed_file_%'"
    ):
        processed.add(row[0])

    total_ml_rows = 0
    total_scanned = 0
    total_downloaded = 0
    total_skipped = 0
    start_time = time.time()

    total_files = len(file_range)
    for idx, i in enumerate(file_range):
        filename = f"heigit_usa_roadsurface_lines_{i}.gpkg"

        if filename in processed:
            print(f"[{idx+1}/{total_files}] {filename} — already processed, skipping")
            total_skipped += 1
            continue

        url = f"{BASE_URL}/{filename}"
        tmp_path = os.path.join(tempfile.gettempdir(), filename)

        print(f"\n[{idx+1}/{total_files}] Downloading {filename} ...")
        if not download_file(url, tmp_path):
            print(f"  ERROR: Failed to download {filename}, skipping")
            continue

        dl_size = format_size(tmp_path)
        print(f"  Downloaded ({dl_size}), extracting ML predictions ...")

        try:
            scanned, ml_count = extract_surface_data(tmp_path, out_conn)
            out_conn.execute(
                "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
                (f"processed_file_{i}", filename),
            )
            out_conn.commit()
            total_scanned += scanned
            total_ml_rows += ml_count
            total_downloaded += 1
            print(f"  Scanned {scanned:,} rows, extracted {ml_count:,} ML predictions ({ml_count*100/scanned:.1f}%)")
        except Exception as e:
            print(f"  ERROR extracting: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
                print(f"  Deleted temp file")

    # Build spatial index after all files are processed
    if total_downloaded > 0:
        build_rtree_index(out_conn)

    out_conn.close()

    elapsed = time.time() - start_time
    db_size = format_size(output_db) if os.path.exists(output_db) else "n/a"

    total_in_db = 0
    if os.path.exists(output_db):
        conn = sqlite3.connect(output_db)
        total_in_db = conn.execute("SELECT COUNT(*) FROM surface").fetchone()[0]
        conn.close()

    print(f"\n{'='*60}")
    print(f"Done in {elapsed/60:.1f} minutes")
    print(f"  Files processed this run: {total_downloaded}")
    print(f"  Files skipped (already done): {total_skipped}")
    print(f"  Total rows scanned: {total_scanned:,}")
    print(f"  ML predictions extracted: {total_ml_rows:,}")
    print(f"  Unique ways in DB: {total_in_db:,}")
    print(f"  Output: {output_db} ({db_size})")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
