import type { ClientPerspective } from '@sanity/client';
import { perspectiveCookieName } from '@sanity/preview-url-secret/constants';
import {
	VisualEditing as SanityVisualEditing,
	type HistoryAdapter,
	type HistoryRefresh,
	type HistoryUpdate,
} from '@sanity/visual-editing/react';
import { useMemo } from 'react';

interface Props {
	basePath: string;
	previewParam: string;
}

function stripPreviewParam(url: URL, previewParam: string): string {
	url.searchParams.delete(previewParam);
	return `${url.pathname}${url.search}${url.hash}`;
}

function currentStudioUrl(previewParam: string): string {
	return stripPreviewParam(new URL(window.location.href), previewParam);
}

function withPreviewParam(target: string, previewParam: string): string {
	const url = new URL(target, window.location.origin);
	url.searchParams.set(previewParam, '1');
	return `${url.pathname}${url.search}${url.hash}`;
}

function createHistoryAdapter(previewParam: string): HistoryAdapter {
	return {
		subscribe(navigate) {
			const reportLocation = (type: HistoryUpdate['type']) =>
				navigate({ type, url: currentStudioUrl(previewParam), title: document.title });
			const onPopState = () => reportLocation('pop');
			reportLocation('push');
			window.addEventListener('popstate', onPopState);
			return () => window.removeEventListener('popstate', onPopState);
		},
		update(update) {
			if (update.type === 'pop') {
				window.history.back();
				return;
			}
			const targetUrl = new URL(update.url, window.location.origin);
			if (stripPreviewParam(targetUrl, previewParam) === currentStudioUrl(previewParam)) return;
			const destination = withPreviewParam(update.url, previewParam);
			if (update.type === 'replace') window.location.replace(destination);
			else window.location.assign(destination);
		},
	};
}

function readCookie(name: string): string | undefined {
	const prefix = `${name}=`;
	const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
	return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
}

function serializePerspective(perspective: ClientPerspective): string {
	return Array.isArray(perspective) ? perspective.join(',') : perspective;
}

function persistPerspective(perspective: ClientPerspective, basePath: string): boolean {
	const value = serializePerspective(perspective);
	if (readCookie(perspectiveCookieName) === value) return false;
	const isEmbedded = window.self !== window.top;
	const attributes = [`Path=${basePath}`, 'Secure', 'SameSite=None'];
	if (isEmbedded) attributes.push('Partitioned');
	document.cookie = `${perspectiveCookieName}=${encodeURIComponent(value)}; ${attributes.join('; ')}`;
	return readCookie(perspectiveCookieName) === value;
}

function reloadPage(_payload: HistoryRefresh): Promise<void> {
	window.location.reload();
	return Promise.resolve();
}

export default function VisualEditing({ basePath, previewParam }: Props) {
	const history = useMemo(() => createHistoryAdapter(previewParam), [previewParam]);
	return (
		<SanityVisualEditing
			portal
			history={history}
			refresh={reloadPage}
			onPerspectiveChange={(perspective) => {
				if (persistPerspective(perspective, basePath)) window.location.reload();
			}}
		/>
	);
}
