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
 * **200 is right, and it is not certain.** Measured over the 39 sheets /catalog
 * draws, our own R2 mirror answers `200,` for 38 and refuses one; `1200,`
 * (FeaturedSheet's plate) is refused by three. The refusal is per sheet, not a
 * property of the service — `info.json` says level2 — so there is no single
 * width that is both small and certain. Asking every sheet for 400 to protect
 * the one that refuses 200 spends ~15 kB × 38 rows to save one 84-byte 404,
 * which is the wrong trade and was reverted.
 *
 * So `stepDown` below: ask for the cheap cut, and climb only on the sheet that
 * actually refuses it.
 *
 * ponytail: regex over parsing the IIIF URL. The only failure it can cause is a
 * width the server will not cut, and `stepDown` is what catches that.
 */
export function atWidth(src: string | undefined, width: number): string | undefined {
  return src?.replace(/\/full\/[^/]+\/(\d+)\/(\w+)\.(\w+)$/, `/full/${width},/$1/$2.$3`);
}

/**
 * `on:error` for an `<img>` whose `src` came from `atWidth`: climb to 400 —
 * the widest cut anything here draws, and one every sheet measured answers —
 * then give up on the stored URL. Two steps, marked on the element, so a sheet
 * that refuses every width cannot loop.
 *
 * It replaces the one-step "fall back to the stored 800": the sheet that
 * refuses 200 was landing on a 145 kB original to fill a 48px cell.
 */
export function stepDown(e: Event, stored: string | undefined): void {
  const img = e.currentTarget as HTMLImageElement;
  if (!stored) return;
  if (!img.dataset.widened) {
    img.dataset.widened = '1';
    const wider = atWidth(stored, 400);
    if (wider && wider !== img.src) {
      img.src = wider;
      return;
    }
  }
  if (img.src !== stored) img.src = stored;
}
