import { createImageUrlBuilder, type ImageFormat, type SanityImageObject } from '@sanity/image-url';
import { dataset, projectId } from './config';

export type SanityImage = SanityImageObject & { alt?: string | null };

interface ImageUrlOptions {
	width: number;
	height?: number;
	format?: ImageFormat;
}

interface Dimensions {
	width: number;
	height: number;
}

const ASSET_ID_PATTERN = /^image-[A-Za-z0-9]+-(\d+)x(\d+)-[a-z0-9]+$/;

const builder = createImageUrlBuilder({ projectId, dataset });

function assetDimensions(source: SanityImage): Dimensions | null {
	const asset = source.asset as {
		_ref?: string;
		_id?: string;
		metadata?: { dimensions?: Partial<Dimensions> };
	};
	const metadata = asset?.metadata?.dimensions;
	if (metadata?.width && metadata.height) {
		return { width: metadata.width, height: metadata.height };
	}
	const match = ASSET_ID_PATTERN.exec(asset?._ref ?? asset?._id ?? '');
	return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

/**
 * Returns the pixel size of the image after its editorial crop, or null when the asset
 * size is unknown, so callers never request an upscaled rendition.
 */
export function croppedImageDimensions(source: SanityImage): Dimensions | null {
	const dimensions = assetDimensions(source);
	if (!dimensions) return null;
	const crop = source.crop;
	return {
		width: Math.round(dimensions.width * (1 - (crop?.left ?? 0) - (crop?.right ?? 0))),
		height: Math.round(dimensions.height * (1 - (crop?.top ?? 0) - (crop?.bottom ?? 0))),
	};
}

function capWidth(source: SanityImage, width: number): number {
	const maxWidth = croppedImageDimensions(source)?.width;
	return maxWidth && maxWidth > 0 ? Math.min(width, maxWidth) : width;
}

export function imageUrl(source: SanityImage, { width, height, format }: ImageUrlOptions): string {
	const cappedWidth = capWidth(source, width);
	let image = builder.image(source).width(cappedWidth).fit('crop');
	if (height) image = image.height(Math.round((height * cappedWidth) / width));
	image = format ? image.format(format) : image.auto('format');
	return image.url();
}

export function imageSrcSet(source: SanityImage, widths: number[], aspectRatio?: number): string {
	const candidates = [...new Set(widths.map((width) => capWidth(source, width)))];
	return candidates
		.sort((a, b) => a - b)
		.map((width) => {
			const height = aspectRatio ? Math.round(width / aspectRatio) : undefined;
			return `${imageUrl(source, { width, height })} ${width}w`;
		})
		.join(', ');
}
