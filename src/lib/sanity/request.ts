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

const PERSPECTIVE_SEGMENT = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_STACK_DEPTH = 10;
const DEFAULT_DRAFT_PERSPECTIVE = 'drafts';

function isPerspectiveStack(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.length <= MAX_STACK_DEPTH &&
		value.every((segment) => typeof segment === 'string' && PERSPECTIVE_SEGMENT.test(segment))
	);
}

function decodePerspectiveCookie(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw.includes(',') ? raw.split(',').map((segment) => segment.trim()) : raw;
	}
}

/**
 * Turns the Presentation perspective cookie (a plain perspective, a comma-separated
 * release stack, or a JSON-encoded stack) into a perspective the client accepts.
 */
export function parseDraftPerspective(raw: string | undefined): ClientPerspective {
	if (!raw) return DEFAULT_DRAFT_PERSPECTIVE;
	const decoded = decodePerspectiveCookie(raw);
	if (decoded === 'drafts' || decoded === 'published') return decoded;
	if (isPerspectiveStack(decoded)) return decoded;
	return DEFAULT_DRAFT_PERSPECTIVE;
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
