import { test, expect } from '@playwright/test';
import { allmapsEditorSourceUrl } from '../src/lib/core/iiif/annotationUrl';

// The editor opens a IIIF resource, not an annotation. Getting the source wrong
// is silent: it starts a blank map instead of loading the points already placed.
test('editor source prefers the manifest, and suffixes info.json', () => {
  expect(allmapsEditorSourceUrl({ iiif_manifest: 'https://x/manifest' })).toBe(
    'https://x/manifest/info.json'
  );
  expect(allmapsEditorSourceUrl({ iiif_manifest: 'https://x/manifest.json' })).toBe(
    'https://x/manifest.json'
  );
});

test('an R2 mirror is skipped — its URL derives a different allmaps_id', () => {
  const sources = [
    { iiif_image: 'https://iiif.maparchive.vn/a', source_type: 'r2' },
    { iiif_image: 'https://gallica.bnf.fr/iiif/b', source_type: 'gallica' },
  ];
  expect(allmapsEditorSourceUrl({}, sources)).toBe('https://gallica.bnf.fr/iiif/b/info.json');
  expect(allmapsEditorSourceUrl({}, [sources[0]])).toBe('');
});

test('the annotation fallback takes no info.json — that URL 404s', () => {
  expect(allmapsEditorSourceUrl({ allmaps_id: 'abc123' })).toBe(
    'https://annotations.allmaps.org/images/abc123'
  );
  // A self-hosted annotation is not something the editor can open at all.
  expect(allmapsEditorSourceUrl({ allmaps_id: 'abc123', annotation_url: 'https://x/a.json' })).toBe(
    ''
  );
});
