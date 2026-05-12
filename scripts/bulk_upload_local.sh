#!/bin/bash
# Bulk upload local JPEGs → R2 IIIF tiles + insert maps/map_iiif_sources rows.
#
# Usage:
#   ./scripts/bulk_upload_local.sh <file-list.txt> [--collection "Service Géographique de l'Indochine"]
#
# file-list.txt: one absolute path per line. Filename pattern parsed as:
#   "<sheet#> <place> <year>.jpg"  → name="<sheet#> <place>", year=<year>
#
# Requires: .env with PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY,
#           rclone "r2:" remote, vips, jq, uuidgen.

set -euo pipefail

FILE_LIST="${1:?Usage: bulk_upload_local.sh <file-list.txt> [--collection ...]}"
COLLECTION="Service Géographique de l'Indochine"
if [[ "${2:-}" == "--collection" ]]; then COLLECTION="${3:-$COLLECTION}"; fi

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then echo "Error: .env not found"; exit 1; fi
SB_URL=$(grep "^PUBLIC_SUPABASE_URL=" .env | cut -d '=' -f2- | tr -d ' "')
SB_KEY=$(grep "^SUPABASE_SERVICE_KEY=" .env | cut -d '=' -f2- | tr -d ' "')
if [[ -z "$SB_URL" || -z "$SB_KEY" ]]; then
  echo "Error: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY missing"; exit 1
fi

WORKER_BASE="https://iiif.maparchive.vn/iiif"
LOG="scripts/bulk_upload_$(date +%Y%m%d_%H%M%S).log"
echo "→ Log: $LOG"

parse_meta() {
  # $1 = basename without .jpg → echoes "NAME|YEAR"
  local base="$1"
  # Trailing 4-digit year
  local year
  year=$(echo "$base" | grep -oE '[0-9]{4}$' || true)
  local name="$base"
  if [[ -n "$year" ]]; then
    name=$(echo "$base" | sed -E "s/[[:space:]]*$year$//")
  fi
  # Collapse whitespace
  name=$(echo "$name" | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')
  echo "${name}|${year}"
}

total=0; ok=0; fail=0
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  [[ ! -f "$path" ]] && { echo "SKIP (missing): $path" | tee -a "$LOG"; continue; }
  total=$((total+1))

  base=$(basename "$path" .jpg)
  IFS='|' read -r NAME YEAR <<< "$(parse_meta "$base")"
  MAP_ID=$(uuidgen | tr 'A-Z' 'a-z')

  echo "" | tee -a "$LOG"
  echo "── [$total] $base ──" | tee -a "$LOG"
  echo "   name=$NAME  year=${YEAR:-?}  uuid=$MAP_ID" | tee -a "$LOG"

  # 1) Insert maps row
  insert_payload=$(jq -n \
    --arg id "$MAP_ID" --arg name "$NAME" \
    --arg col "$COLLECTION" \
    --argjson year "${YEAR:-null}" \
    '{
      id: $id,
      name: $name,
      year: $year,
      collection: $col,
      source_type: "self",
      status: "draft",
      map_type: "topographic"
    }')
  resp=$(curl -s -w "\n%{http_code}" -X POST "$SB_URL/rest/v1/maps" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d "$insert_payload")
  body=$(echo "$resp" | sed '$d'); code=$(echo "$resp" | tail -1)
  if [[ "$code" != "201" ]]; then
    echo "   ✗ maps insert failed ($code): $body" | tee -a "$LOG"
    fail=$((fail+1)); continue
  fi

  # 2) Tile + upload to R2 (no original-iiif-base; this is the origin)
  if ! ./scripts/tile_map.sh "$MAP_ID" "$path" 2>&1 | tee -a "$LOG"; then
    echo "   ✗ tile_map.sh failed" | tee -a "$LOG"
    fail=$((fail+1)); continue
  fi

  IIIF_URL="$WORKER_BASE/$MAP_ID"

  # 3) Insert map_iiif_sources row (primary, self-hosted)
  src_payload=$(jq -n --arg map_id "$MAP_ID" --arg url "$IIIF_URL" \
    '{ map_id: $map_id, label: "R2 (self-hosted)", source_type: "self",
       iiif_image: $url, is_primary: true, sort_order: 0 }')
  resp=$(curl -s -w "\n%{http_code}" -X POST "$SB_URL/rest/v1/map_iiif_sources" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d "$src_payload")
  body=$(echo "$resp" | sed '$d'); code=$(echo "$resp" | tail -1)
  if [[ "$code" != "201" ]]; then
    echo "   ✗ map_iiif_sources insert failed ($code): $body" | tee -a "$LOG"
    fail=$((fail+1)); continue
  fi

  # 4) Update maps.iiif_image (trigger on map_iiif_sources should also sync; redundant but safe)
  curl -s -X PATCH "$SB_URL/rest/v1/maps?id=eq.$MAP_ID" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"iiif_image\":\"$IIIF_URL\"}" > /dev/null

  echo "   ✓ $IIIF_URL" | tee -a "$LOG"
  ok=$((ok+1))
done < "$FILE_LIST"

echo "" | tee -a "$LOG"
echo "═══ Done: $ok ok / $fail fail / $total total ═══" | tee -a "$LOG"
