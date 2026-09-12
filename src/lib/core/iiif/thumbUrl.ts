/**
 * thumbUrl.ts — the same IIIF image at a chosen width.
 *
 * Both URL shapes we hold (`/full/,400/` from the annotation, `/full/800,/`
 * from the `maps.thumbnail` column) end in the same three segments, so swapping
 * the size is a string edit. Anything that is not a IIIF Image API URL comes
 * back unchanged, which is what makes it safe to call on every row.
 *
 * It exists because the stored column is 800px wide and almost nothing renders
 * it at that size: the /catalog table draws it in a 96px cell and the archive
 * rail in a 40px one. Five 800s were 715 kB of front page for five thumbnails
 * (`FeaturedSheet`), and a 39-row list is worse.
 *
 * **Ask for 400, not less.** Our own R2 mirror is a worker over a pyramid whose
 * smallest level is 467px wide, and it 404s anything below that (1200 too, which
 * is between levels) — so a 200 for a 48px cell cost a failed request and then
 * the full 800 through the caller's `onerror` anyway. 400 is the smallest width
 * every source we hold will actually cut, which is why `FeaturedSheet` had
 * settled on it. Other hosts (archive.org, Gallica) cut anything.
 *
 * ponytail: regex over parsing the IIIF URL. The only failure it can cause is a
 * width the server will not cut, and every caller's <img> falls back to the
 * stored URL on error.
 */
export function atWidth(src: string | undefined, width: number): string | undefined {
  return src?.replace(/\/full\/[^/]+\/(\d+)\/(\w+)\.(\w+)$/, `/full/${width},/$1/$2.$3`);
}
