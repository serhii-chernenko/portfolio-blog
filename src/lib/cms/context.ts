import { getRequestContext } from 'emdash';

/**
 * Per-request CMS view. `preview` is true when EmDash serves drafts for this request: a signed
 * `_preview` link from the admin ("View on site") or an authenticated edit-mode request. Preview
 * responses also show scheduled (future-dated) content and are never cached or indexed.
 */
export interface CmsContext {
	preview: boolean;
}

/** A fresh object per call: per-request memos (UI string overrides) are keyed by context. */
export function createPublishedContext(): CmsContext {
	return { preview: false };
}

/** Reads EmDash's request context, which its middleware fills before ours runs. */
export function createRequestContext(): CmsContext {
	const emdash = getRequestContext();
	return { preview: Boolean(emdash?.preview || emdash?.editMode) };
}

export function getCmsContext(locals: App.Locals): CmsContext {
	return locals.cms ?? createPublishedContext();
}

export function includesScheduledContent(ctx: CmsContext): boolean {
	return ctx.preview;
}
