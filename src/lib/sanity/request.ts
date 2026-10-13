import type { ClientPerspective, QueryParams, SanityClient } from '@sanity/client';
import { previewClient, publishedClient } from './client';

export interface SanityContext {
	preview: boolean;
	perspective: ClientPerspective;
	fetch<T>(query: string, params?: QueryParams): Promise<T>;
}

interface DraftModeOptions {
	token?: string;
	perspective: ClientPerspective;
}

const BASE_PERSPECTIVES = ['drafts', 'published'] as const;
const RELEASE_ID_PATTERN = /^r[A-Za-z0-9]+$/;
const MAX_STACK_DEPTH = 10;
const DEFAULT_DRAFT_PERSPECTIVE = 'drafts';

type BasePerspective = (typeof BASE_PERSPECTIVES)[number];

function isBasePerspective(value: string): value is BasePerspective {
	return (BASE_PERSPECTIVES as readonly string[]).includes(value);
}

function isAllowedStackSegment(segment: string): boolean {
	return isBasePerspective(segment) || RELEASE_ID_PATTERN.test(segment);
}

/**
 * Maps the perspective cookie onto an allow-listed perspective: `drafts`, `published`, or a
 * comma-separated stack of those and release ids. Anything else falls back to `drafts`.
 */
export function parseDraftPerspective(raw: string | undefined): ClientPerspective {
	if (!raw) return DEFAULT_DRAFT_PERSPECTIVE;
	if (isBasePerspective(raw)) return raw;
	const segments = raw.split(',');
	if (segments.length > MAX_STACK_DEPTH || !segments.every(isAllowedStackSegment)) {
		return DEFAULT_DRAFT_PERSPECTIVE;
	}
	return segments as ClientPerspective;
}

export function includesScheduledContent(ctx: SanityContext): boolean {
	return ctx.perspective !== 'published';
}

function memoKey(query: string, params: QueryParams, perspective: ClientPerspective): string {
	return JSON.stringify([query, params, perspective]);
}

function createContext(
	client: SanityClient,
	preview: boolean,
	perspective: ClientPerspective,
): SanityContext {
	const memo = new Map<string, Promise<unknown>>();
	return {
		preview,
		perspective,
		fetch<T>(query: string, params: QueryParams = {}): Promise<T> {
			const key = memoKey(query, params, perspective);
			const cached = memo.get(key);
			if (cached) return cached as Promise<T>;
			const pending = client.fetch<T>(query, params).catch((error: unknown) => {
				memo.delete(key);
				throw error;
			});
			memo.set(key, pending);
			return pending;
		},
	};
}

export function createPublishedContext(): SanityContext {
	return createContext(publishedClient, false, 'published');
}

export function createRequestContext(draftMode: DraftModeOptions | null): SanityContext {
	if (!draftMode?.token) return createPublishedContext();
	return createContext(
		previewClient(draftMode.token, draftMode.perspective),
		true,
		draftMode.perspective,
	);
}

export function getSanityContext(locals: App.Locals): SanityContext {
	return locals.sanity ?? createPublishedContext();
}
