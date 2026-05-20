/**
 * MVP: default OG image. Phase 2 will generate per-post OG via satori.
 * Returns an absolute URL.
 */
export function defaultOgImage(site: URL | string): string {
	const base = typeof site === 'string' ? new URL(site) : site;
	return new URL('/og-default.png', base).toString();
}
