/**
 * Internet Archive S3 upload.
 */

import { error } from '@sveltejs/kit';
import { IA_S3_ACCESS_KEY, IA_S3_SECRET_KEY } from '$env/static/private';

export interface IAUploadResult {
  identifier: string;
  filename: string;
  /** IIIF Image API v3 `info.json` for the uploaded file. */
  iiifUrl: string;
}

/**
 * PUT a file into an IA item, creating the bucket if it does not exist.
 * `title` becomes the item's `x-archive-meta-title`.
 */
export async function uploadToIA(
  file: File,
  identifier: string,
  title: string
): Promise<IAUploadResult> {
  const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');

  const res = await fetch(`https://s3.us.archive.org/${identifier}/${filename}`, {
    method: 'PUT',
    headers: {
      Authorization: `LOW ${IA_S3_ACCESS_KEY}:${IA_S3_SECRET_KEY}`,
      'x-amz-auto-make-bucket': '1',
      'x-archive-meta-title': title,
      'x-archive-meta-mediatype': 'image',
      'x-archive-meta-collection': 'opensource_image',
      'Content-Type': file.type,
    },
    body: await file.arrayBuffer(),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => String(res.status));
    console.error('[ia] S3 upload error:', errorText);
    throw error(500, `Internet Archive upload failed: ${errorText}`);
  }

  return {
    identifier,
    filename,
    iiifUrl: `https://iiif.archive.org/iiif/3/${identifier}%2F${filename}/info.json`,
  };
}
