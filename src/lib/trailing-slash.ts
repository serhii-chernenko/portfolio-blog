const ASSET_EXTENSIONS = new Set([
	'xml',
	'txt',
	'png',
	'jpg',
	'jpeg',
	'webp',
	'avif',
	'svg',
	'ico',
	'webmanifest',
	'json',
	'css',
	'js',
	'pdf',
]);

export function hasAssetExtension(path: string): boolean {
	const lastSegment = path.slice(path.lastIndexOf('/') + 1);
	const extension = /\.([A-Za-z0-9]+)$/.exec(lastSegment)?.[1];
	return extension !== undefined && ASSET_EXTENSIONS.has(extension.toLowerCase());
}

export function withTrailingSlash(path: string): string {
	if (path === '' || path.endsWith('/') || hasAssetExtension(path)) return path;
	return `${path}/`;
}
