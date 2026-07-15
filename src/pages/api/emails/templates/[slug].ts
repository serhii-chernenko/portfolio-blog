import type { APIRoute } from 'astro';
import {
	readTemplate,
	writeTemplate,
	deleteTemplate,
	assertSlug,
} from '../../../../lib/emails-store';
import type { Locale } from '../../../../lib/emails-store';
import { validateEmailTemplateVariables } from '../../../../lib/email-template-variables';

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

export const GET: APIRoute = async ({ params }) => {
	const guard = guardLocal();
	if (guard) return guard;

	const slug = params.slug ?? '';
	try {
		assertSlug(slug);
	} catch {
		return jsonError('Invalid slug', 400);
	}

	const template = await readTemplate(slug);
	if (!template) {
		return jsonError('Template not found', 404);
	}

	return new Response(JSON.stringify(template), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
};

export const PUT: APIRoute = async ({ params, request }) => {
	const guard = guardLocal();
	if (guard) return guard;

	const slug = params.slug ?? '';
	try {
		assertSlug(slug);
	} catch {
		return jsonError('Invalid slug', 400);
	}

	const existing = await readTemplate(slug);
	if (!existing) {
		return jsonError('Template not found', 404);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError('Invalid JSON body', 400);
	}

	if (!body || typeof body !== 'object') {
		return jsonError('Invalid request body', 400);
	}

	const { name, subject, locale, json, html, text } = body as Record<string, unknown>;

	if (typeof name !== 'string' || !name.trim()) {
		return jsonError('Invalid or missing name', 400);
	}
	if (typeof subject !== 'string' || !subject.trim()) {
		return jsonError('Invalid or missing subject', 400);
	}
	if (locale !== 'en' && locale !== 'uk') {
		return jsonError('locale must be "en" or "uk"', 400);
	}
	if (typeof html !== 'string') {
		return jsonError('html must be a string', 400);
	}
	if (typeof text !== 'string' || !text.trim()) {
		return jsonError('text must be a non-empty string', 400);
	}
	if (json === undefined || json === null) {
		return jsonError('json is required', 400);
	}

	const variableErrors = validateEmailTemplateVariables(slug, { html, text });
	if (variableErrors.length > 0) {
		return jsonError(variableErrors.join('; '), 400);
	}

	const saved = await writeTemplate(slug, {
		name,
		subject,
		locale: locale as Locale,
		json,
		html,
		text,
	});

	return new Response(JSON.stringify(saved), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
};

export const DELETE: APIRoute = async ({ params }) => {
	const guard = guardLocal();
	if (guard) return guard;

	const slug = params.slug ?? '';
	try {
		assertSlug(slug);
	} catch {
		return jsonError('Invalid slug', 400);
	}

	const deleted = await deleteTemplate(slug);
	if (!deleted) {
		return jsonError('Template not found', 404);
	}

	return new Response(null, { status: 204 });
};
