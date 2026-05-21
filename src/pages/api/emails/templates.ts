import type { APIRoute } from 'astro';
import {
	listTemplates,
	writeTemplate,
	templateExists,
	assertSlug,
	SLUG_RE,
} from '../../../lib/emails-store';

export const prerender = false;

function jsonError(message: string, status: number): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

function guardLocal(): Response | null {
	// These endpoints read/write the local filesystem, which is unavailable in
	// Cloudflare Workers. Only allow access in local development mode.
	if (import.meta.env.PUBLIC_KEYSTATIC_MODE !== 'local') {
		return jsonError('Not available in production', 403);
	}
	return null;
}

export const GET: APIRoute = async () => {
	const guard = guardLocal();
	if (guard) return guard;

	const templates = await listTemplates();
	return new Response(JSON.stringify({ templates }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
};

export const POST: APIRoute = async ({ request }) => {
	const guard = guardLocal();
	if (guard) return guard;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError('Invalid JSON body', 400);
	}

	if (!body || typeof body !== 'object') {
		return jsonError('Invalid request body', 400);
	}

	const { slug, name, subject, locale } = body as Record<string, unknown>;

	if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
		return jsonError('Invalid or missing slug', 400);
	}
	if (typeof name !== 'string' || !name.trim()) {
		return jsonError('Invalid or missing name', 400);
	}
	if (typeof subject !== 'string' || !subject.trim()) {
		return jsonError('Invalid or missing subject', 400);
	}
	if (locale !== 'en' && locale !== 'uk') {
		return jsonError('locale must be "en" or "uk"', 400);
	}

	try {
		assertSlug(slug);
	} catch {
		return jsonError('Invalid slug', 400);
	}

	const exists = await templateExists(slug);
	if (exists) {
		return jsonError('Template already exists', 409);
	}

	await writeTemplate(slug, {
		name,
		subject,
		locale,
		json: { type: 'doc', content: [] },
		html: '',
	});

	return new Response(JSON.stringify({ slug }), {
		status: 201,
		headers: { 'content-type': 'application/json' },
	});
};
