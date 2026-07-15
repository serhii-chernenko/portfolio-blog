import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export type Locale = 'en' | 'uk';

export interface EmailTemplate {
	slug: string;
	name: string;
	subject: string;
	locale: Locale;
	updatedAt: string;
	json: unknown;
	html: string;
	text: string;
}

export interface EmailTemplateSummary {
	slug: string;
	name: string;
	subject: string;
	locale: Locale;
	updatedAt: string;
}

// Path-traversal is blocked at the call site via assertSlug, but keeping the
// resolution anchored to the emails dir provides defense-in-depth.
const EMAILS_DIR = join(process.cwd(), 'src/emails');

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/i;

export function assertSlug(slug: string): void {
	if (!SLUG_RE.test(slug)) {
		throw new Error(`Invalid slug: ${slug}`);
	}
}

function filePath(slug: string): string {
	return join(EMAILS_DIR, `${slug}.json`);
}

export async function listTemplates(): Promise<EmailTemplateSummary[]> {
	const entries = await readdir(EMAILS_DIR);
	const summaries: EmailTemplateSummary[] = [];

	for (const entry of entries) {
		if (!entry.endsWith('.json')) continue;
		const slug = entry.slice(0, -5);
		if (!SLUG_RE.test(slug)) continue;

		try {
			const raw = await readFile(join(EMAILS_DIR, entry), 'utf-8');
			const data = JSON.parse(raw) as Omit<EmailTemplate, 'slug'>;
			summaries.push({
				slug,
				name: data.name,
				subject: data.subject,
				locale: data.locale,
				updatedAt: data.updatedAt,
			});
		} catch {
			// Skip files that are unreadable or malformed.
		}
	}

	return summaries.sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
}

export async function readTemplate(slug: string): Promise<EmailTemplate | null> {
	try {
		const raw = await readFile(filePath(slug), 'utf-8');
		const data = JSON.parse(raw) as Omit<EmailTemplate, 'slug'>;
		return { slug, ...data };
	} catch {
		return null;
	}
}

export async function writeTemplate(
	slug: string,
	data: Omit<EmailTemplate, 'slug' | 'updatedAt'>,
): Promise<EmailTemplate> {
	const updatedAt = new Date().toISOString();
	const template: Omit<EmailTemplate, 'slug'> = { ...data, updatedAt };
	await writeFile(filePath(slug), JSON.stringify(template, null, '\t'), 'utf-8');
	return { slug, ...template };
}

export async function deleteTemplate(slug: string): Promise<boolean> {
	try {
		await unlink(filePath(slug));
		return true;
	} catch {
		return false;
	}
}

export async function templateExists(slug: string): Promise<boolean> {
	try {
		await readFile(filePath(slug));
		return true;
	} catch {
		return false;
	}
}
