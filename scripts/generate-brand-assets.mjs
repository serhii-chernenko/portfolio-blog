import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const PUBLIC_DIR = new URL('../public/blog/', import.meta.url);

const SITE_NAME = 'Chernenko';
const TAGLINE = 'Notes on engineering, photography, and craft.';
const HOST = 'serhiichernenko.com/blog';

const BACKGROUND = '#1d232a';
const FOREGROUND = '#f8fafc';
const MUTED = '#94a3b8';
const ACCENT = '#7aa2f7';
const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const MARGIN_X = 96;

const MANIFEST_ICON_SIZES = [192, 512];
const APPLE_TOUCH_ICON_SIZE = 180;
const ICO_SIZE = 32;

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
	<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${BACKGROUND}"/>
	<rect x="${MARGIN_X}" y="150" width="72" height="8" rx="4" fill="${ACCENT}"/>
	<text x="${MARGIN_X}" y="330" font-family="${FONT_STACK}" font-size="172" font-weight="700" letter-spacing="-4" fill="${FOREGROUND}">${SITE_NAME}</text>
	<text x="${MARGIN_X}" y="410" font-family="${FONT_STACK}" font-size="40" fill="${MUTED}">${TAGLINE}</text>
	<text x="${MARGIN_X}" y="${OG_HEIGHT - 96}" font-family="${FONT_STACK}" font-size="32" font-weight="600" fill="${ACCENT}">${HOST}</text>
</svg>`;

function monogramSvg(cornerRadius) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
	<rect width="64" height="64" rx="${cornerRadius}" fill="${BACKGROUND}"/>
	<text x="32" y="47" text-anchor="middle" font-family="${FONT_STACK}" font-size="42" font-weight="700" fill="${FOREGROUND}">C</text>
	<rect x="18" y="52" width="28" height="3" rx="1.5" fill="${ACCENT}"/>
</svg>`;
}

const faviconSvg = monogramSvg(14);
const opaqueSquareSvg = monogramSvg(0);

function renderSquareIcon(size, svg = faviconSvg) {
	return sharp(Buffer.from(svg), { density: (72 * size) / 64 })
		.resize(size, size)
		.png({ compressionLevel: 9 })
		.toBuffer();
}

function wrapPngAsIco(png, size) {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(1, 4);

	const entry = Buffer.alloc(16);
	entry.writeUInt8(size, 0);
	entry.writeUInt8(size, 1);
	entry.writeUInt16LE(1, 4);
	entry.writeUInt16LE(32, 6);
	entry.writeUInt32LE(png.length, 8);
	entry.writeUInt32LE(header.length + entry.length, 12);

	return Buffer.concat([header, entry, png]);
}

function writePublic(name, data) {
	return writeFile(new URL(name, PUBLIC_DIR), data);
}

const ogImage = await sharp(Buffer.from(ogSvg))
	.png({ palette: true, compressionLevel: 9 })
	.toBuffer();
await writePublic('og-default.png', ogImage);

await writePublic('favicon.svg', `${faviconSvg}\n`);

await writePublic('favicon.ico', wrapPngAsIco(await renderSquareIcon(ICO_SIZE), ICO_SIZE));

await writePublic(
	'apple-touch-icon.png',
	await renderSquareIcon(APPLE_TOUCH_ICON_SIZE, opaqueSquareSvg),
);

for (const size of MANIFEST_ICON_SIZES) {
	await writePublic(`icon-${size}.png`, await renderSquareIcon(size));
}

const manifest = {
	name: SITE_NAME,
	short_name: SITE_NAME,
	description: TAGLINE,
	start_url: '/blog/en/',
	scope: '/blog/',
	display: 'standalone',
	background_color: BACKGROUND,
	theme_color: BACKGROUND,
	icons: MANIFEST_ICON_SIZES.map((size) => ({
		src: `/blog/icon-${size}.png`,
		sizes: `${size}x${size}`,
		type: 'image/png',
		purpose: 'any',
	})),
};
await writePublic('site.webmanifest', `${JSON.stringify(manifest, null, '\t')}\n`);

console.log(
	'generate-brand-assets: wrote og-default.png, favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, site.webmanifest',
);
