export interface TileParams {
  tileSize: number;
  overlap: number;
  renderSize: number;
  tileCount: number;
}

/** JS port of Python auto_tile_params — scale tile size to hit a target API call count. */
export function autoTileParams(
  fullW: number,
  fullH: number,
  targetCalls = 12,
  baseRender = 1024,
  baseTile = 2400,
  overlapRatio = 0.125
): TileParams {
  let bestTile = baseTile;
  let bestDiff = Infinity;
  let bestCount = 0;
  const maxDim = Math.max(fullW, fullH);
  for (let ts = baseTile; ts <= maxDim + 200; ts += 200) {
    const ovlp = Math.floor(ts * overlapRatio);
    const step = ts - ovlp;
    const cols = Math.ceil(Math.max(fullW - ovlp, 1) / step);
    const rows = Math.ceil(Math.max(fullH - ovlp, 1) / step);
    const n = cols * rows;
    if (Math.abs(n - targetCalls) < bestDiff) {
      bestDiff = Math.abs(n - targetCalls);
      bestTile = ts;
      bestCount = n;
    }
    if (n <= targetCalls) break;
  }
  const renderSize = Math.min(Math.floor(bestTile * baseRender / baseTile), 4096);
  return {
    tileSize: bestTile,
    overlap: Math.floor(bestTile * overlapRatio),
    renderSize,
    tileCount: bestCount,
  };
}

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
