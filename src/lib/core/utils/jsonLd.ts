/**
 * A schema.org block as the `<script>` string `{@html}` wants.
 *
 * `<` is escaped because `JSON.stringify` does not escape it: a map name or a
 * place spelling containing `</script>` would otherwise close the tag early
 * and spill the rest of the graph into the document as markup.
 */
export const jsonLd = (data: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
