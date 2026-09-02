#!/usr/bin/env bash
# Build a city-sized PMTiles basemap extract, and optionally upload it.
#
#   scripts/pmtiles_extract.sh <name> <bbox> [maxzoom] [--upload]
#
#   name     region slug; the archive is written to <name>.pmtiles
#   bbox     minLng,minLat,maxLng,maxLat
#   maxzoom  default 15. Protomaps builds overzoom past their own max, so 15 is
#            plenty for a city and keeps the archive small.
#   --upload  rclone the result to r2:vma-tiles/basemap/<name>.pmtiles
#
# Examples — the two extracts that exist today, and the two the roadmap wants:
#
#   scripts/pmtiles_extract.sh saigon 106.3,10.3,107.1,11.2            # ~37 MB
#   scripts/pmtiles_extract.sh hoian  108.3150,15.8690,108.3420,15.8860 # ~1.3 MB
#   scripts/pmtiles_extract.sh hanoi  105.75,20.95,105.95,21.10
#   scripts/pmtiles_extract.sh hue    107.53,16.42,107.65,16.52
#
# Why this script exists: both the archive and the event app ship a self-hosted
# Protomaps extract, and both carried their own copy of this command in a code
# comment. One recipe, two consumers — see docs/platform-design.md §3. When the
# pnpm workspace lands this moves to packages/basemap unchanged.
#
# The archive's bbox becomes the map's maxBounds in the app, so panning cannot
# reach blank paper. Keep the two in step: if you widen the extract, widen the
# bounds in the style, and if you narrow it, narrow them.
#
# ponytail: no date argument. Protomaps keeps daily builds for about a week, so
# a pinned date rots faster than the script; this walks back from today until a
# build answers. Pass PMTILES_SOURCE to override with any archive URL or path.
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 64
fi

NAME="$1"
BBOX="$2"
MAXZOOM="${3:-15}"
[ "${MAXZOOM}" = "--upload" ] && MAXZOOM=15
UPLOAD=""
for arg in "$@"; do [ "$arg" = "--upload" ] && UPLOAD=1; done

command -v pmtiles >/dev/null || { echo "pmtiles CLI not found — brew install pmtiles" >&2; exit 69; }

case "$BBOX" in
  *,*,*,*) ;;
  *) echo "bbox must be minLng,minLat,maxLng,maxLat — got '$BBOX'" >&2; exit 64 ;;
esac

OUT="${NAME}.pmtiles"

find_source() {
  if [ -n "${PMTILES_SOURCE:-}" ]; then echo "$PMTILES_SOURCE"; return; fi
  # Yesterday first: today's build may not have finished.
  for back in 1 2 3 4 5 6 7; do
    if date -v-1d >/dev/null 2>&1; then
      day=$(date -v-"${back}"d +%Y%m%d)      # BSD date (macOS)
    else
      day=$(date -d "-${back} day" +%Y%m%d)  # GNU date
    fi
    url="https://build.protomaps.com/${day}.pmtiles"
    if curl -fsI --max-time 20 "$url" >/dev/null 2>&1; then echo "$url"; return; fi
  done
  echo "no Protomaps daily build answered in the last 7 days" >&2
  return 1
}

SOURCE="$(find_source)"
echo "source:  $SOURCE"
echo "extract: $OUT  bbox=$BBOX  maxzoom=$MAXZOOM"

pmtiles extract "$SOURCE" "$OUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"
ls -lh "$OUT" | awk '{print "built:   " $9 " (" $5 ")"}'

if [ -n "$UPLOAD" ]; then
  command -v rclone >/dev/null || { echo "rclone not found; archive left at $OUT" >&2; exit 69; }
  rclone copyto "$OUT" "r2:vma-tiles/basemap/${NAME}.pmtiles" --s3-no-check-bucket
  echo "uploaded: iiif.maparchive.vn/basemap/${NAME}.pmtiles"
else
  echo "not uploaded. Re-run with --upload, or:"
  echo "  rclone copyto $OUT r2:vma-tiles/basemap/${NAME}.pmtiles --s3-no-check-bucket"
fi
