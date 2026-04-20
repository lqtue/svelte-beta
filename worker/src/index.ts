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

		const serviceUrl = new URL(url.href);
		serviceUrl.search = '';
		const infoServiceUrl = serviceUrl.href.replace(/\/info\.json$/, '');

		if (obj) {
			if (key.endsWith('info.json')) {
				let text = await obj.text();
				try {
					const info = JSON.parse(text);
					// All R2 info.jsons from dzsave are v3
					info['id'] = infoServiceUrl;
					info['@context'] = 'http://iiif.io/api/image/3/context.json';
					info['type'] = 'ImageService3';
					info['protocol'] = 'http://iiif.io/api/image';
					info['profile'] = 'level2';
					text = JSON.stringify(info);
				} catch (e) {
					text = text.replace(/"id"\s*:\s*"[^"]*"/, `"id": "${infoServiceUrl}"`);
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
			return new Response(JSON.stringify({ error: 'Source not found', mapId }), { 
				status: 404, 
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } 
			});
		}

		const sourceBase = (await sourceObj.text()).trim().replace(/\/+$/, '');
		const cleanRest = rest.replace(/^\/+/, '');
		const originalUrl = `${sourceBase}/${cleanRest}`;

		let proxyRes: Response;
		try {
			proxyRes = await fetch(originalUrl, { headers: { Accept: 'image/jpeg,image/png,*/*' } });
		} catch (e: any) {
			return new Response(JSON.stringify({ error: 'Proxy fetch failed', message: e?.message }), { 
				status: 502, 
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } 
			});
		}

		const contentType = proxyRes.headers.get('Content-Type') ?? 'image/jpeg';

		// ── Metadata Splicing (info.json / manifest.json) ────────────────────────
		if (contentType.includes('json') || rest.endsWith('.json') || rest.endsWith('info.json')) {
			let text = await proxyRes.text();

			if (rest.endsWith('info.json')) {
				try {
					const info = JSON.parse(text);
					const isR2 = text.includes('ImageService3') || !info['@context'];
					if (isR2) {
						info['id'] = infoServiceUrl;
						info['@context'] = 'http://iiif.io/api/image/3/context.json';
						info['type'] = 'ImageService3';
						info['protocol'] = 'http://iiif.io/api/image';
						info['profile'] = 'level2';
						info['extraFeatures'] = ['mirroring'];
					} else {
						// Proxied v2 source (e.g. Gallica) — preserve version, just rewrite @id
						info['@id'] = infoServiceUrl;
					}
					text = JSON.stringify(info);
				} catch (e) {
					text = text.replaceAll(sourceBase, infoServiceUrl);
				}
			} else {
				text = text.replaceAll(sourceBase, infoServiceUrl);
			}

			return new Response(text, {
				// Cache info.json for 1 hour in browser to avoid hammering upstream (Gallica rate limits)
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...CORS_HEADERS },
			});
		}

		// ── Non-OK tile response: try reciprocal quality suffix before giving up ──
		// default.jpg (IIIF v3) ↔ native.jpg (IIIF v2 / Gallica)
		if (!proxyRes.ok) {
			let altUrl: string | null = null;
			if (rest.endsWith('/default.jpg')) {
				altUrl = originalUrl.replace(/\/default\.jpg$/, '/native.jpg');
			} else if (rest.endsWith('/native.jpg')) {
				altUrl = originalUrl.replace(/\/native\.jpg$/, '/default.jpg');
			}
			if (altUrl) {
				try {
					const altRes = await fetch(altUrl, { headers: { Accept: 'image/jpeg,image/png,*/*' } });
					if (altRes.ok) {
						return new Response(altRes.body, {
							headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', ...CORS_HEADERS },
						});
					}
				} catch {}
			}
			return new Response(JSON.stringify({ error: `Source returned ${proxyRes.status}`, url: originalUrl }), {
				status: proxyRes.status === 429 ? 429 : 404,
				headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
			});
		}

		return new Response(proxyRes.body, {
			headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400', ...CORS_HEADERS },
		});
	},
};
