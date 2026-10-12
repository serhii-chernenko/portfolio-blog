import { createImageUrlBuilder, type ImageFormat, type SanityImageObject } from '@sanity/image-url';
import { dataset, projectId } from './config';

export type SanityImage = SanityImageObject & { alt?: string | null };

interface ImageUrlOptions {
	width: number;
	height?: number;
	format?: ImageFormat;
}

const builder = createImageUrlBuilder({ projectId, dataset });

export function imageUrl(source: SanityImage, { width, height, format }: ImageUrlOptions): string {
	let image = builder.image(source).width(width).fit('crop');
	if (height) image = image.height(height);
	image = format ? image.format(format) : image.auto('format');
	return image.url();
}

export function imageSrcSet(source: SanityImage, widths: number[], aspectRatio?: number): string {
	return widths
		.map((width) => {
			const height = aspectRatio ? Math.round(width / aspectRatio) : undefined;
			return `${imageUrl(source, { width, height })} ${width}w`;
		})
		.join(', ');
}
