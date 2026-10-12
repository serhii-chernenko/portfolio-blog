import type { APIRoute } from 'astro';
import { expiredPerspectiveCookies, safeBlogRedirect } from '../../../lib/sanity/draft-mode';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
	const headers = new Headers({
		location: safeBlogRedirect(url.searchParams.get('redirect'), url, false),
		'cache-control': 'no-store',
	});
	for (const cookie of expiredPerspectiveCookies()) headers.append('set-cookie', cookie);
	return new Response(null, { status: 307, headers });
};
