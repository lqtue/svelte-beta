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
 * **200 is right, and it is not certain.** There are two classes of sheet behind
 * `iiif.maparchive.vn`. Most are proxied to a service that cuts any width on
 * demand. A *mirrored* sheet is level0: a handful of pre-generated objects in
 * R2 and nothing cut on demand, so it answers the widths that existed at mirror
 * time and 404s everything else. `eca788e5-…-20260911` serves **400 and 800 and
 * nothing else** — 100, 300, 467, 500, 933, 1200 and 1865 all 404, including
 * the three its own `info.json` lists as sizes. That `info.json` says level2 is
 * boilerplate, not behaviour, so it cannot be used to tell the two apart.
 *
 * Measured over the 39 sheets /catalog draws: `200,` is refused by 1 and
 * `1200,` (FeaturedSheet's plate) by 3. Asking every sheet for 400 to protect
 * the one that refuses 200 spends ~15 kB × 38 rows to save one 84-byte 404 —
 * the wrong trade, and reverted once already.
 *
 * So `stepDown` below, and note **no hardcoded width is safe**: 400 is not a
 * property of the service, it is just what that mirror happens to hold, and the
 * next mirrored sheet may hold a different pair. The final fall back to the
 * stored URL is the step that actually guarantees a picture — keep it.
 *
 * ponytail: regex over parsing the IIIF URL. The only failure it can cause is a
 * width the server will not cut, and `stepDown` is what catches that.
 */
export function atWidth(src: string | undefined, width: number): string | undefined {
  return src?.replace(/\/full\/[^/]+\/(\d+)\/(\w+)\.(\w+)$/, `/full/${width},/$1/$2.$3`);
}

/**
 * `on:error` for an `<img>` whose `src` came from `atWidth`: climb to 400 — the
 * widest cut anything here draws, and the one every sheet measured happens to
 * hold — then give up on the stored URL, which is the only width a mirrored
 * sheet is certain to have, being where the column came from. Two steps, marked on the element, so a sheet
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
