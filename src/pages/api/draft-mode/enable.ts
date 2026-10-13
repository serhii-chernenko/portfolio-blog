import type { APIRoute } from 'astro';
import { validatePreviewUrl } from '@sanity/preview-url-secret';
import { publishedClient } from '../../../lib/sanity/client';
import {
	draftSessionCookie,
	isCrossSiteIframe,
	perspectiveCookie,
	safeBlogRedirect,
} from '../../../lib/sanity/draft-mode';
import { parseDraftPerspective } from '../../../lib/sanity/request';
import { getDraftModeSecrets } from '../../../lib/server-secrets';

export const prerender = false;

function unauthorized(): Response {
	return new Response('Unauthorized', {
		status: 401,
		headers: { 'cache-control': 'no-store' },
	});
}

export const GET: APIRoute = async ({ request, url }) => {
	const secrets = await getDraftModeSecrets();
	if (!secrets) return unauthorized();

	const { isValid, redirectTo, studioPreviewPerspective } = await validatePreviewUrl(
		publishedClient.withConfig({ token: secrets.readToken, useCdn: false }),
		request.url,
	);
	if (!isValid) return unauthorized();

	const partitioned = isCrossSiteIframe(request);
	const perspective = parseDraftPerspective(studioPreviewPerspective ?? undefined);
	const headers = new Headers({
		location: safeBlogRedirect(redirectTo, url, true),
		'cache-control': 'no-store',
	});
	headers.append('set-cookie', perspectiveCookie(perspective, partitioned));
	headers.append('set-cookie', await draftSessionCookie(secrets.cookieSecret, partitioned));
	return new Response(null, { status: 307, headers });
};
