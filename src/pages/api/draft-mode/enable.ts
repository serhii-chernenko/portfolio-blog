import type { APIRoute } from 'astro';
import { SANITY_API_READ_TOKEN } from 'astro:env/server';
import { validatePreviewUrl } from '@sanity/preview-url-secret';
import { publishedClient } from '../../../lib/sanity/client';
import {
	isCrossSiteIframe,
	perspectiveCookie,
	safeBlogRedirect,
} from '../../../lib/sanity/draft-mode';
import { parseDraftPerspective } from '../../../lib/sanity/request';

export const prerender = false;

function unauthorized(): Response {
	return new Response('Unauthorized', {
		status: 401,
		headers: { 'cache-control': 'no-store' },
	});
}

export const GET: APIRoute = async ({ request, url }) => {
	if (!SANITY_API_READ_TOKEN) return unauthorized();

	const { isValid, redirectTo, studioPreviewPerspective } = await validatePreviewUrl(
		publishedClient.withConfig({ token: SANITY_API_READ_TOKEN, useCdn: false }),
		request.url,
	);
	if (!isValid) return unauthorized();

	const perspective = parseDraftPerspective(studioPreviewPerspective ?? undefined);
	return new Response(null, {
		status: 307,
		headers: {
			location: safeBlogRedirect(redirectTo, url, true),
			'set-cookie': perspectiveCookie(perspective, isCrossSiteIframe(request)),
			'cache-control': 'no-store',
		},
	});
};
