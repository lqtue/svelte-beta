#!/bin/bash
# For all maps with iiif_image on iiif.maparchive.vn:
#   - strip leading "<sheetN> " from name (preserve sheet number in extra_metadata.sheet_number)
#   - fetch info.json → use smallest pyramid size as thumbnail URL
#   - PATCH the row.
#
# Idempotent: skips rows where the name has no leading digits and a thumbnail is already set.

set -euo pipefail
cd "$(dirname "$0")/.."

SB_URL=$(grep "^PUBLIC_SUPABASE_URL=" .env | cut -d '=' -f2- | tr -d ' "')
SB_KEY=$(grep "^SUPABASE_SERVICE_KEY=" .env | cut -d '=' -f2- | tr -d ' "')
[[ -z "$SB_URL" || -z "$SB_KEY" ]] && { echo "Missing env"; exit 1; }

DRY="${DRY_RUN:-0}"

maps=$(curl -s "$SB_URL/rest/v1/maps?select=id,name,iiif_image,thumbnail,extra_metadata&iiif_image=like.*iiif.maparchive.vn*" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY")

count=$(echo "$maps" | jq 'length')
echo "→ Found $count R2-hosted maps"

echo "$maps" | jq -c '.[]' | while IFS= read -r row; do
  id=$(echo "$row"      | jq -r '.id')
  name=$(echo "$row"    | jq -r '.name')
  iiif=$(echo "$row"    | jq -r '.iiif_image')
  thumb=$(echo "$row"   | jq -r '.thumbnail // ""')
  extra=$(echo "$row"   | jq -c '.extra_metadata // {}')

  # Parse leading "<number>[b]?" e.g. "20 Ha Noi", "05b Bao Loc"
  sheet=$(echo "$name" | grep -oE '^[0-9]+[a-z]?\.?' | head -1 | sed 's/\.$//' || true)
  newname="$name"
  if [[ -n "$sheet" ]]; then
    newname=$(echo "$name" | sed -E "s/^[0-9]+[a-z]?\.?[[:space:]]+//")
  fi

  # Build thumbnail URL from info.json smallest size
  newthumb="$thumb"
  if [[ -z "$thumb" ]]; then
    info=$(curl -sf "${iiif%/}/info.json" || echo "")
    if [[ -n "$info" ]]; then
      last=$(echo "$info" | jq -r '.sizes // [] | last | "\(.width),\(.height)"')
      if [[ "$last" != "null,null" && -n "$last" ]]; then
        newthumb="${iiif%/}/full/${last}/0/default.jpg"
      else
        echo "   ⚠ $name — info.json has no sizes; skipping thumbnail"
      fi
    else
      echo "   ⚠ $name — info.json fetch failed"
    fi
  fi

  # Skip if nothing to change
  if [[ "$newname" == "$name" && "$newthumb" == "$thumb" && -z "$sheet" ]]; then
    continue
  fi

  # Merge sheet_number into extra_metadata
  newextra="$extra"
  if [[ -n "$sheet" ]]; then
    newextra=$(echo "$extra" | jq -c --arg s "$sheet" '. + {sheet_number: $s}')
  fi

  patch=$(jq -n \
    --arg name "$newname" \
    --arg thumb "$newthumb" \
    --argjson extra "$newextra" \
    '{name: $name, thumbnail: $thumb, extra_metadata: $extra}')

  echo "── $id"
  echo "   name:  '$name' → '$newname'  (sheet=$sheet)"
  echo "   thumb: $newthumb"

  if [[ "$DRY" == "1" ]]; then
    continue
  fi

  resp=$(curl -s -w "\n%{http_code}" -X PATCH "$SB_URL/rest/v1/maps?id=eq.$id" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" \
    -d "$patch")
  code=$(echo "$resp" | tail -1)
  if [[ "$code" != "200" && "$code" != "204" ]]; then
    echo "   ✗ PATCH failed ($code): $(echo "$resp" | sed '$d')"
  else
    echo "   ✓ updated"
  fi
done
