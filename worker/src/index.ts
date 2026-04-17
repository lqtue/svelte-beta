interface Env {
	TILES: R2Bucket;
}

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}
		if (request.method !== 'GET') {
			return new Response('Method not allowed', { status: 405 });
		}

		const url = new URL(request.url);

		// /iiif/{mapId}/info.json  or  /iiif/{mapId}/{region}/{size}/{rotation}/{quality}.{format}
		const match = url.pathname.match(/^\/iiif\/([^/]+)(\/.*)?$/);
		if (!match) return new Response('Not found', { status: 404, headers: CORS_HEADERS });

		const mapId = match[1];
		const rest = decodeURIComponent(match[2] || '');
		const key = `tiles/${mapId}${rest}`;

		// ── R2 cache hit ──────────────────────────────────────────────────────
		let obj = null;
		if (!url.searchParams.has('force_proxy')) {
			obj = await env.TILES.get(key);
		}

		if (obj) {
			if (key.endsWith('info.json')) {
				let text = await obj.text();
				const serviceUrl = url.href.replace(/\/info\.json$/, '');
				try {
					const info = JSON.parse(text);
					// All R2 info.jsons from dzsave are v3
					info['id'] = serviceUrl;
					info['@context'] = 'http://iiif.io/api/image/3/context.json';
					info['type'] = 'ImageService3';
					info['protocol'] = 'http://iiif.io/api/image';
					info['profile'] = 'level2';
					text = JSON.stringify(info);
				} catch (e) {
					text = text.replace(/"id"\s*:\s*"[^"]*"/, `"id": "${serviceUrl}"`);
				}
				return new Response(text, {
					headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=0', ...CORS_HEADERS },
				});
			}
			return new Response(obj.body, {
				headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', ...CORS_HEADERS },
			});
		}

		// ── R2 miss: proxy to original IIIF source ────────────────────────────
		const sourceObj = await env.TILES.get(`sources/${mapId}`);
		if (!sourceObj) {
			return new Response(`no-source:${mapId}`, { status: 404, headers: CORS_HEADERS });
		}

		const sourceBase = (await sourceObj.text()).trim().replace(/\/+$/, '');
		const cleanRest = rest.replace(/^\/+/, '');
		const originalUrl = `${sourceBase}/${cleanRest}`;

		let proxyRes: Response;
		try {
			proxyRes = await fetch(originalUrl, { headers: { Accept: 'image/jpeg,image/png,*/*' } });
		} catch (e: any) {
			return new Response(`proxy-error:${e?.message}`, { status: 502, headers: CORS_HEADERS });
		}

		if (!proxyRes.ok) {
			return new Response(`proxy-${proxyRes.status}:${originalUrl}`, { status: 404, headers: CORS_HEADERS });
		}

		const contentType = proxyRes.headers.get('Content-Type') ?? 'image/jpeg';

		// ── Metadata Splicing (info.json / manifest.json) ────────────────────────
		if (contentType.includes('json') || rest.endsWith('.json') || rest.endsWith('info.json')) {
			let text = await proxyRes.text();
			const serviceUrl = url.href.replace(/\/info\.json$/, '');
			
			// If it is an info.json, determine if it came from R2 or proxy
			if (rest.endsWith('info.json')) {
				try {
					const info = JSON.parse(text);
					
					// If it came from R2 (id matches mapId pattern), enhance it
					const isR2 = text.includes('ImageService3') || !info['@context'];
					
					if (isR2) {
						// Ensure it looks like a high-quality IIIF v3 service
						info['id'] = serviceUrl;
						info['@context'] = 'http://iiif.io/api/image/3/context.json';
						info['type'] = 'ImageService3';
						info['protocol'] = 'http://iiif.io/api/image';
						info['profile'] = 'level2';
						// Add some common service features to help OL
						info['extraFeatures'] = ['canonicalLinkHeader', 'profileLinkHeader', 'mirroring'];
					} else {
						// Proxied from Gallica (v2)
						info['@id'] = serviceUrl;
					}
					text = JSON.stringify(info);
				} catch (e) {
					text = text.replaceAll(sourceBase, serviceUrl);
				}
			} else {
				// For manifests, just do the recursive replace
				text = text.replaceAll(sourceBase, serviceUrl);
			}

			return new Response(text, {
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=0', ...CORS_HEADERS },
			});
		}

		// ── Reciprocal Suffix Mapping for R2 ──────────────────────────────────
		// If R2 check fails with one suffix, try the other before falling back to proxy.
		if (proxyRes.status === 404) {
			let secondaryUrl = null;
			if (rest.endsWith('/default.jpg')) {
				secondaryUrl = originalUrl.replace(/\/default\.jpg$/, '/native.jpg');
			} else if (rest.endsWith('/native.jpg')) {
				secondaryUrl = originalUrl.replace(/\/native\.jpg$/, '/default.jpg');
			}

			if (secondaryUrl) {
				const secondaryRes = await fetch(secondaryUrl, { headers: { Accept: 'image/jpeg,image/png,*/*' } });
				if (secondaryRes.ok) {
					return new Response(secondaryRes.body, {
						headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', ...CORS_HEADERS },
					});
				}
			}
		}

		return new Response(proxyRes.body, {
			headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400', ...CORS_HEADERS },
		});
	},
};
