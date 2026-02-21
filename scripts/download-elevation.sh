#!/usr/bin/env bash
# Download SRTM 1-arc-second elevation tiles for Michigan from ESA.
#
# Coverage: 41°N–48°N, 83°W–91°W (Lower + Upper Peninsula)
# Tiles over open water may not exist — 404s are skipped gracefully.
#
# Usage:
#   ./scripts/download-elevation.sh [output_dir]
#   Default output: data/elevation/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/data/elevation}"
BASE_URL="https://step.esa.int/auxdata/dem/SRTMGL1"

mkdir -p "$OUT_DIR"

# Michigan bounding box (generous): lat 41–47, lng W083–W090
LATS=(41 42 43 44 45 46 47)
LNGS=(83 84 85 86 87 88 89 90)

total=0
downloaded=0
skipped=0
already=0

for lat in "${LATS[@]}"; do
  for lng in "${LNGS[@]}"; do
    total=$((total + 1))
    tile="N${lat}W0${lng}"
    hgt_file="${OUT_DIR}/${tile}.hgt"

    # Skip if already downloaded
    if [[ -f "$hgt_file" ]]; then
      echo "[skip] ${tile}.hgt already exists"
      already=$((already + 1))
      continue
    fi

    zip_name="${tile}.SRTMGL1.hgt.zip"
    url="${BASE_URL}/${zip_name}"

    echo -n "[fetch] ${tile} ... "
    http_code=$(curl -sS -w "%{http_code}" -o "/tmp/${zip_name}" "$url" 2>/dev/null || echo "000")

    if [[ "$http_code" == "200" ]]; then
      unzip -oq "/tmp/${zip_name}" -d "$OUT_DIR"
      rm -f "/tmp/${zip_name}"
      echo "ok ($(du -h "$hgt_file" | cut -f1))"
      downloaded=$((downloaded + 1))
    else
      rm -f "/tmp/${zip_name}"
      echo "not available (HTTP ${http_code})"
      skipped=$((skipped + 1))
    fi
  done
done

echo ""
echo "Done: ${downloaded} downloaded, ${already} already existed, ${skipped} not available (${total} total tiles)"
echo "Tiles directory: ${OUT_DIR}"
