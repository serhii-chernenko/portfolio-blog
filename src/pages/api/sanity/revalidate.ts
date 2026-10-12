import type { APIRoute } from 'astro';
import { SANITY_WEBHOOK_SECRET } from 'astro:env/server';
import { isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook';
import { SANITY_CACHE_TAG } from '../../../lib/sanity/config';

export const prerender = false;

const MAX_BODY_BYTES = 256_000;

function json(body: Record<string, unknown>, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
	});
}

async function hasValidSignature(request: Request, secret: string): Promise<boolean> {
	const signature = request.headers.get(SIGNATURE_HEADER_NAME);
	if (!signature) return false;
	const body = await request.text();
	if (!body || body.length > MAX_BODY_BYTES) return false;
	try {
		return await isValidSignature(body, signature, secret);
	} catch {
		return false;
	}
}

export const POST: APIRoute = async (context) => {
	if (
		!SANITY_WEBHOOK_SECRET ||
		!(await hasValidSignature(context.request, SANITY_WEBHOOK_SECRET))
	) {
		return json({ error: 'Invalid signature' }, 401);
	}
	if (!context.cache.enabled) return json({ purged: false }, 200);
	try {
		await context.cache.invalidate({ tags: [SANITY_CACHE_TAG] });
	} catch (error) {
		console.error(
			JSON.stringify({
				message: 'Failed to purge Sanity cache tag',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return json({ error: 'Cache purge failed' }, 503);
	}
	return json({ purged: true }, 200);
};
