import { stegaClean } from '@sanity/client/stega';
import type { TypedObject } from 'astro-portabletext/types';

export interface TocHeading {
	depth: number;
	slug: string;
	text: string;
}

export type HeadingBlock = TypedObject & { style: string; headingId: string };

interface TextBlock extends TypedObject {
	style?: string;
	children?: { text?: string }[];
}

const HEADING_DEPTHS: Record<string, number> = { h2: 2, h3: 3, h4: 4 };
const FALLBACK_HEADING_SLUG = 'section';

function isHeadingBlock(node: TypedObject): node is TextBlock & { style: string } {
	const style = (node as TextBlock).style;
	return node._type === 'block' && typeof style === 'string' && style in HEADING_DEPTHS;
}

function blockText(block: TextBlock): string {
	return (block.children ?? []).map((child) => child.text ?? '').join('');
}

export function headingSlug(text: string): string {
	return (
		stegaClean(text)
			.toLowerCase()
			.normalize('NFKC')
			.trim()
			.replace(/[^\p{L}\p{N}\s-]/gu, '')
			.replace(/[\s-]+/g, '-')
			.replace(/^-+|-+$/g, '') || FALLBACK_HEADING_SLUG
	);
}

/**
 * Assigns a stable, de-duplicated `headingId` to every h2–h4 block and returns the
 * matching table of contents, so heading anchors and TOC links share one slug source.
 */
export function annotateHeadings(body: TypedObject[] | undefined): {
	blocks: TypedObject[];
	headings: TocHeading[];
} {
	const seen = new Map<string, number>();
	const headings: TocHeading[] = [];
	const blocks = (body ?? []).map((node) => {
		if (!isHeadingBlock(node)) return node;
		const text = blockText(node);
		const base = headingSlug(text);
		const occurrence = (seen.get(base) ?? 0) + 1;
		seen.set(base, occurrence);
		const slug = occurrence === 1 ? base : `${base}-${occurrence}`;
		headings.push({ depth: HEADING_DEPTHS[node.style], slug, text });
		return { ...node, headingId: slug } satisfies HeadingBlock;
	});
	return { blocks, headings };
}
