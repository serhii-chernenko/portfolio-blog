import { after, type LogAccess } from 'emdash';
import { notify } from './telegram';
import { environmentFromHost } from './telemetry-schema';

export interface CreatedCommentEvent {
	comment: {
		id: string;
		authorName: string;
		body: string;
		status: string;
		parentId: string | null;
	};
	content: { slug: string; title?: string };
}

export interface CommentHookDeps {
	siteUrl: string;
	log: Pick<LogAccess, 'info'>;
}

const EXCERPT_LENGTH = 280;
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function escapeHtml(text: string): string {
	return text.replace(/[&<>]/g, (char) => HTML_ESCAPES[char] ?? char);
}

function excerpt(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

/**
 * Telegram message for every new comment, so comments held for moderation don't wait unseen
 * (EmDash's own notifications need an email provider). Production host only; runs after the
 * response and never fails the submission.
 */
export function handleCommentCreated(event: CreatedCommentEvent, deps: CommentHookDeps): void {
	let site: URL;
	try {
		site = new URL(deps.siteUrl);
	} catch {
		return;
	}
	if (environmentFromHost(site.host) !== 'production') return;
	const { comment, content } = event;
	const pending = comment.status === 'pending';
	const kind = comment.parentId ? 'reply' : 'comment';
	const adminUrl = new URL('/_emdash/admin/comments', site).toString();
	const message = [
		`💬 New ${kind} on <b>${escapeHtml(content.title || content.slug)}</b> by ${escapeHtml(comment.authorName)}${pending ? ' — awaiting moderation' : ''}`,
		escapeHtml(excerpt(comment.body)),
		adminUrl,
	].join('\n\n');
	deps.log.info('New comment; notifying Telegram', { id: comment.id, status: comment.status });
	after(() => notify(message));
}
