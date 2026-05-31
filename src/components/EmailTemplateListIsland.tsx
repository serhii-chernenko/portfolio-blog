import { useState, useEffect, useRef } from 'react';

interface TemplateSummary {
	slug: string;
	name: string;
	subject: string;
	locale: 'en' | 'uk';
	updatedAt: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/i;

export default function EmailTemplateListIsland() {
	const [templates, setTemplates] = useState<TemplateSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [fetchError, setFetchError] = useState<string | null>(null);

	const [newSlug, setNewSlug] = useState('');
	const [newName, setNewName] = useState('');
	const [newSubject, setNewSubject] = useState('');
	const [newLocale, setNewLocale] = useState<'en' | 'uk'>('en');
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [slugError, setSlugError] = useState<string | null>(null);

	const slugInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		fetchTemplates();
	}, []);

	async function fetchTemplates() {
		setLoading(true);
		setFetchError(null);
		try {
			const res = await fetch('/api/emails/templates');
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}
			const data = (await res.json()) as { templates: TemplateSummary[] };
			setTemplates(data.templates);
		} catch (err) {
			setFetchError(err instanceof Error ? err.message : 'Failed to load templates');
		} finally {
			setLoading(false);
		}
	}

	async function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		setCreateError(null);
		setSlugError(null);

		const slug = newSlug.trim();
		if (!SLUG_RE.test(slug)) {
			setSlugError(
				'Lowercase letters, digits, and dashes only — must start with a letter or digit',
			);
			slugInputRef.current?.focus();
			return;
		}

		setCreating(true);
		try {
			const res = await fetch('/api/emails/templates', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					slug,
					name: newName.trim(),
					subject: newSubject.trim(),
					locale: newLocale,
				}),
			});

			if (res.status === 409) {
				setSlugError('A template with this slug already exists');
				slugInputRef.current?.focus();
				return;
			}
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}

			window.location.href = `/admin/emails/${slug}`;
		} catch (err) {
			setCreateError(err instanceof Error ? err.message : 'Failed to create template');
		} finally {
			setCreating(false);
		}
	}

	function formatDate(iso: string) {
		try {
			return new Date(iso).toLocaleString('en-GB', {
				dateStyle: 'medium',
				timeStyle: 'short',
			});
		} catch {
			return iso;
		}
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
			<div className="mb-8 flex items-center justify-between gap-4">
				<h1 className="text-2xl font-bold tracking-tight">Email templates</h1>
			</div>

			{fetchError && (
				<div className="alert alert-error mb-6">
					<span>{fetchError}</span>
					<button className="btn btn-sm btn-ghost" onClick={fetchTemplates}>
						Retry
					</button>
				</div>
			)}

			{loading ? (
				<div className="flex justify-center py-12">
					<span className="loading loading-spinner loading-lg"></span>
				</div>
			) : (
				<>
					{templates.length === 0 && !fetchError && (
						<p className="text-base-content/50 mb-8 text-sm">No templates yet. Create one below.</p>
					)}

					{templates.length > 0 && (
						<div className="card border border-base-300 mb-10 overflow-hidden">
							<table className="table table-zebra">
								<thead>
									<tr>
										<th>Name</th>
										<th>Subject</th>
										<th>Locale</th>
										<th>Updated</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{templates.map((t) => (
										<tr key={t.slug}>
											<td className="font-medium">
												<a href={`/admin/emails/${t.slug}`} className="link link-hover">
													{t.name}
												</a>
												<div className="text-xs text-base-content/50 font-mono mt-0.5">
													{t.slug}
												</div>
											</td>
											<td className="text-base-content/70 max-w-xs truncate">{t.subject}</td>
											<td>
												<span className="badge badge-outline badge-sm">{t.locale}</span>
											</td>
											<td className="text-xs text-base-content/50 whitespace-nowrap">
												{formatDate(t.updatedAt)}
											</td>
											<td>
												<a href={`/admin/emails/${t.slug}`} className="btn btn-xs btn-ghost">
													Edit
												</a>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

					<form onSubmit={handleCreate}>
						<fieldset className="fieldset border border-base-300 rounded-box p-6">
							<legend className="fieldset-legend text-lg font-semibold">New template</legend>

							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div>
									<label className="label" htmlFor="new-slug">
										Slug
									</label>
									<input
										id="new-slug"
										ref={slugInputRef}
										type="text"
										className="input w-full font-mono"
										placeholder="welcome-email"
										value={newSlug}
										onChange={(e) => setNewSlug(e.currentTarget.value)}
										required
										pattern="[a-zA-Z0-9][a-zA-Z0-9\-]*"
									/>
									{slugError ? (
										<p className="text-error text-sm mt-1">{slugError}</p>
									) : (
										<p className="label">
											Lowercase letters, digits, and dashes — e.g. <code>welcome-email</code>
										</p>
									)}
								</div>

								<div>
									<label className="label" htmlFor="new-name">
										Name
									</label>
									<input
										id="new-name"
										type="text"
										className="input w-full"
										placeholder="Welcome email"
										value={newName}
										onChange={(e) => setNewName(e.currentTarget.value)}
										required
									/>
								</div>

								<div>
									<label className="label" htmlFor="new-subject">
										Subject line
									</label>
									<input
										id="new-subject"
										type="text"
										className="input w-full"
										placeholder="Welcome to {{site_name}}!"
										value={newSubject}
										onChange={(e) => setNewSubject(e.currentTarget.value)}
										required
									/>
								</div>

								<div>
									<label className="label" htmlFor="new-locale">
										Locale
									</label>
									<select
										id="new-locale"
										className="select w-full"
										value={newLocale}
										onChange={(e) => setNewLocale(e.currentTarget.value as 'en' | 'uk')}
									>
										<option value="en">English (en)</option>
										<option value="uk">Ukrainian (uk)</option>
									</select>
								</div>

								{createError && (
									<div className="sm:col-span-2">
										<div className="alert alert-error py-2 text-sm">{createError}</div>
									</div>
								)}

								<div className="sm:col-span-2 flex justify-end">
									<button type="submit" className="btn btn-primary" disabled={creating}>
										{creating && <span className="loading loading-spinner loading-sm"></span>}
										Create template
									</button>
								</div>
							</div>
						</fieldset>
					</form>
				</>
			)}
		</div>
	);
}
