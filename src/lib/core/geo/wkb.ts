/**
 * wkb.ts — the one thing we need out of PostGIS's binary format: a point.
 *
 * `ocr_extractions.geom` comes back over PostgREST as EWKB hex, e.g.
 * `0101000020E6100000` + two little-endian float64s. Asking Postgres for
 * GeoJSON instead would mean a view or an RPC; parsing 40 hex characters is
 * cheaper than either.
 *
 * ponytail: points only, little-endian only, which is every row Supabase has
 * ever returned. A LINESTRING or a big-endian byte order returns null rather
 * than a wrong coordinate. If the archive ever stores geometry that is not a
 * point, take a real WKB library rather than growing this.
 */

/** `[lng, lat]`, or null if the hex is not a little-endian EWKB/WKB point. */
export function parsePointHex(hex: string | null | undefined): [number, number] | null {
  if (typeof hex !== 'string') return null;
  const h = hex.trim();
  // byte 0 = 01 (little-endian); bytes 1-4 = type, low 8 bits must be 1 (point).
  // Bit 0x20000000 of the type says an SRID follows, which shifts the coords.
  if (h.length < 42 || h.slice(0, 2) !== '01') return null;

  const type = parseInt(swap32(h.slice(2, 10)), 16);
  if ((type & 0xff) !== 1) return null;
  const start = type & 0x20000000 ? 18 : 10;
  if (h.length < start + 32) return null;

  const lng = float64(h.slice(start, start + 16));
  const lat = float64(h.slice(start + 16, start + 32));
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

/** Eight hex characters, little-endian, as a big-endian hex string. */
function swap32(h: string): string {
  return h.slice(6, 8) + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
}

/** Sixteen hex characters, little-endian, as a double. */
function float64(h: string): number {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return new DataView(bytes.buffer).getFloat64(0, true);
}
