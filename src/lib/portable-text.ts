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

interface PlainTextBlock extends TextBlock {
	listItem?: string;
}

interface CodeNode extends TypedObject {
	code?: string;
	language?: string;
}

interface CalloutNode extends TypedObject {
	body?: TypedObject[];
}

const BLOCK_PREFIXES: Record<string, string> = {
	h2: '## ',
	h3: '### ',
	h4: '#### ',
	blockquote: '> ',
};

const LIST_PREFIXES: Record<string, string> = {
	bullet: '- ',
	number: '1. ',
};

function blockToPlainText(block: PlainTextBlock): string {
	const text = blockText(block);
	if (!text) return '';
	const listPrefix = block.listItem ? LIST_PREFIXES[block.listItem] : undefined;
	return `${listPrefix ?? BLOCK_PREFIXES[block.style ?? ''] ?? ''}${text}`;
}

interface ImageNode extends TypedObject {
	alt?: string;
}

interface YouTubeNode extends TypedObject {
	videoId?: string;
	title?: string;
}

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const DEFAULT_VIDEO_LINK_TEXT = 'Video';

function inlineText(text: string): string {
	return stegaClean(text).replace(/\s+/g, ' ').trim();
}

function imageToPlainText(node: ImageNode): string {
	const alt = inlineText(node.alt ?? '');
	return alt ? `[Image: ${alt}]` : '';
}

function youtubeToPlainText(node: YouTubeNode): string {
	const videoId = stegaClean(node.videoId ?? '');
	if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) return '';
	const title = inlineText(node.title ?? '').replace(/[[\]]/g, '') || DEFAULT_VIDEO_LINK_TEXT;
	return `[${title}](https://www.youtube.com/watch?v=${videoId})`;
}

function codeToPlainText(node: CodeNode): string {
	const code = node.code ?? '';
	if (!code) return '';
	const language = node.language && node.language !== 'text' ? node.language : '';
	return `\`\`\`${language}\n${code}\n\`\`\``;
}

/**
 * Flattens Portable Text into Markdown-flavoured plain text: prose blocks, callout bodies,
 * fenced code blocks, image alt text and YouTube links, so text consumers see everything a
 * reader sees.
 */
export function portableTextToPlainText(body: TypedObject[] | undefined): string {
	const parts = (body ?? []).map((node) => {
		if (node._type === 'block') return blockToPlainText(node as PlainTextBlock);
		if (node._type === 'code') return codeToPlainText(node as CodeNode);
		if (node._type === 'callout') return portableTextToPlainText((node as CalloutNode).body);
		if (node._type === 'image') return imageToPlainText(node as ImageNode);
		if (node._type === 'youtube') return youtubeToPlainText(node as YouTubeNode);
		return '';
	});
	return parts.filter(Boolean).join('\n\n');
}
