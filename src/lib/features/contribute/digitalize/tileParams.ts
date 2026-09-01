/** Enumerate tile (x,y,w,h) rects covering a neatline region. */
export function buildTileGrid(
  nx: number,
  ny: number,
  nw: number,
  nh: number,
  tileSize: number,
  overlap: number
): [number, number, number, number][] {
  const tiles: [number, number, number, number][] = [];
  const step = tileSize - overlap;
  if (step <= 0) return tiles;
  for (let y = ny; y < ny + nh; y += step) {
    for (let x = nx; x < nx + nw; x += step) {
      const tw = Math.min(tileSize, nx + nw - x);
      const th = Math.min(tileSize, ny + nh - y);
      tiles.push([x, y, tw, th]);
    }
  }
  return tiles;
}

export type TilePriority = 'low_res' | 'skip';
export type TileOverrides = Record<string, TilePriority>;

export function tileKey(x: number, y: number, w: number, h: number): string {
  return `${x}_${y}_${w}_${h}`;
}
