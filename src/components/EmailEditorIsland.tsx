import { useState, useEffect, useRef, useCallback } from 'react';
import { EmailEditor, type EmailEditorRef } from '@react-email/editor';
import '@react-email/editor/themes/default.css';
import '@react-email/editor/styles/bubble-menu.css';
import '@react-email/editor/styles/slash-command.css';
import '@react-email/editor/styles/inspector.css';
interface EmailTemplate {
	slug: string;
	name: string;
	subject: string;
	locale: 'en' | 'uk';
	updatedAt: string;
	json: Record<string, unknown>;
	html: string;
}

interface Props {
	slug: string;
}

function extractVariables(html: string): string[] {
	const matches = html.matchAll(/\{\{([^}]+)\}\}/g);
	const vars = new Set<string>();
	for (const m of matches) {
		vars.add(m[1].trim());
	}
	return [...vars];
}

function validateEmailUrl(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed === '#') return trimmed;
	if (/^\{\{[^}]+\}\}$/.test(trimmed)) return trimmed;
	try {
		const url = new URL(trimmed);
		if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return trimmed;
		return null;
	} catch {}
	try {
		if (trimmed.includes('.') && !trimmed.includes(' '))
			return new URL(`https://${trimmed}`).toString();
	} catch {}
	return null;
}

export default function EmailEditorIsland({ slug }: Props) {
	const editorRef = useRef<EmailEditorRef>(null);

	const [template, setTemplate] = useState<EmailTemplate | null>(null);
	const [loading, setLoading] = useState(true);
	const [fetchError, setFetchError] = useState<string | null>(null);

	const [name, setName] = useState('');
	const [subject, setSubject] = useState('');
	const [locale, setLocale] = useState<'en' | 'uk'>('en');
	const [currentHtml, setCurrentHtml] = useState('');

	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const [showHtmlPreview, setShowHtmlPreview] = useState(false);

	useEffect(() => {
		async function load() {
			setLoading(true);
			setFetchError(null);
			try {
				const res = await fetch(`/api/emails/templates/${slug}`);
				if (!res.ok) {
					const data = await res.json().catch(() => ({})) as { error?: string };
					throw new Error(data.error ?? `HTTP ${res.status}`);
				}
				const data = await res.json() as EmailTemplate;
				setTemplate(data);
				setName(data.name);
				setSubject(data.subject);
				setLocale(data.locale);
				setCurrentHtml(data.html);
			} catch (err) {
				setFetchError(err instanceof Error ? err.message : 'Failed to load template');
			} finally {
				setLoading(false);
			}
		}
		load();
	}, [slug]);

	const handleEditorUpdate = useCallback((ref: EmailEditorRef) => {
		const json = ref.getJSON();
		ref.getEmailHTML().then((html) => {
			setCurrentHtml(html);
		}).catch(() => {});
		// Silence unused var — json is captured lazily on save via editorRef
		void json;
	}, []);

	async function handleSave() {
		if (!editorRef.current) return;
		setSaving(true);
		setSaveError(null);
		setSaveSuccess(false);

		try {
			const [{ html }, json] = await Promise.all([
				editorRef.current.getEmail(),
				Promise.resolve(editorRef.current.getJSON()),
			]);

			const res = await fetch(`/api/emails/templates/${slug}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, subject, locale, json, html }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({})) as { error?: string };
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}

			const saved = await res.json() as EmailTemplate;
			setTemplate(saved);
			setCurrentHtml(saved.html);
			setSaveSuccess(true);
			setTimeout(() => setSaveSuccess(false), 2500);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : 'Failed to save');
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
		setDeleting(true);
		try {
			const res = await fetch(`/api/emails/templates/${slug}`, { method: 'DELETE' });
			if (!res.ok && res.status !== 204) {
				const data = await res.json().catch(() => ({})) as { error?: string };
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}
			window.location.href = '/admin/emails';
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to delete template');
			setDeleting(false);
		}
	}

	const variables = extractVariables(currentHtml);

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<span className="loading loading-spinner loading-lg"></span>
			</div>
		);
	}

	if (fetchError) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-16 text-center">
				<div className="alert alert-error mb-6">{fetchError}</div>
				<a href="/admin/emails" className="btn btn-ghost btn-sm">
					← Back to templates
				</a>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col">
			{/* Sticky header */}
			<header className="sticky top-0 z-50 border-b border-base-300 bg-base-100/90 backdrop-blur-sm">
				<div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
					<a href="/admin/emails" className="btn btn-ghost btn-sm">
						← Back
					</a>
					<span className="font-mono text-sm text-base-content/50">{slug}</span>
					<div className="ml-auto flex items-center gap-2">
						{saveSuccess && (
							<span className="text-sm text-success font-medium">Saved</span>
						)}
						{saveError && (
							<span className="text-sm text-error truncate max-w-xs">{saveError}</span>
						)}
						<button
							className="btn btn-outline btn-sm"
							onClick={() => setShowHtmlPreview((v) => !v)}
						>
							{showHtmlPreview ? 'Hide HTML' : 'View HTML'}
						</button>
						<button
							className="btn btn-primary btn-sm"
							onClick={handleSave}
							disabled={saving}
						>
							{saving && <span className="loading loading-spinner loading-xs"></span>}
							Save
						</button>
						<button
							className="btn btn-error btn-outline btn-sm"
							onClick={handleDelete}
							disabled={deleting}
						>
							{deleting && <span className="loading loading-spinner loading-xs"></span>}
							Delete
						</button>
					</div>
				</div>
			</header>

			<div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
				{/* Meta fields */}
				<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="form-control">
						<label className="label" htmlFor="tpl-name">
							<span className="label-text font-medium">Name</span>
						</label>
						<input
							id="tpl-name"
							type="text"
							className="input input-bordered"
							value={name}
							onChange={(e) => setName(e.currentTarget.value)}
						/>
					</div>
					<div className="form-control">
						<label className="label" htmlFor="tpl-subject">
							<span className="label-text font-medium">Subject line</span>
						</label>
						<input
							id="tpl-subject"
							type="text"
							className="input input-bordered"
							value={subject}
							onChange={(e) => setSubject(e.currentTarget.value)}
						/>
					</div>
					<div className="form-control">
						<label className="label" htmlFor="tpl-locale">
							<span className="label-text font-medium">Locale</span>
						</label>
						<select
							id="tpl-locale"
							className="select select-bordered"
							value={locale}
							onChange={(e) => setLocale(e.currentTarget.value as 'en' | 'uk')}
						>
							<option value="en">English (en)</option>
							<option value="uk">Ukrainian (uk)</option>
						</select>
					</div>
				</div>

				{/* Variables hint */}
				{variables.length > 0 && (
					<div className="mb-4 flex flex-wrap items-center gap-2">
						<span className="text-xs text-base-content/50 font-medium uppercase tracking-wide">Variables:</span>
						{variables.map((v) => (
							<span key={v} className="badge badge-outline badge-sm font-mono">
								{`{{${v}}}`}
							</span>
						))}
					</div>
				)}

				{/* Editor */}
				<div className="card border border-base-300 mb-6 overflow-hidden">
					<div className="card-body p-0">
						<EmailEditor
							ref={editorRef}
							content={template?.json}
							onUpdate={handleEditorUpdate}
							className="min-h-[520px]"
							// @ts-expect-error — validateUrl is exposed by patches/@react-email__editor@1.4.1.patch
							validateUrl={validateEmailUrl}
						/>
					</div>
				</div>

				{/* HTML preview */}
				{showHtmlPreview && (
					<div className="card border border-base-300 overflow-hidden">
						<div className="card-body p-0">
							<div className="flex items-center justify-between border-b border-base-300 px-4 py-2">
								<span className="text-xs font-medium text-base-content/50 uppercase tracking-wide">
									Rendered HTML preview
								</span>
								<button
									className="btn btn-ghost btn-xs"
									onClick={() => setShowHtmlPreview(false)}
								>
									Close
								</button>
							</div>
							<iframe
								srcDoc={currentHtml}
								title="Email HTML preview"
								className="h-[600px] w-full border-0"
								sandbox="allow-same-origin"
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
