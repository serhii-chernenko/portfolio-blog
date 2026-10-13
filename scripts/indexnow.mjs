import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const HOST = 'serhiichernenko.com';
export const SITE_ORIGIN = `https://${HOST}`;
export const SCOPE_PREFIX = `${SITE_ORIGIN}/blog/`;
export const SITEMAP_INDEX_URL = `${SITE_ORIGIN}/blog/sitemap-index.xml`;
export const INDEXNOW_KEY = 'aa97432c46c58c839540be4d044ece78';
export const KEY_LOCATION = `${SCOPE_PREFIX}${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const BATCH_SIZE = 10_000;
export const MAX_SITEMAP_DEPTH = 3;
export const CACHE_BUST_PARAM = 'indexnow';

const SUCCESS_STATUSES = new Set([200, 202]);
const STATUS_MEANINGS = new Map([
	[400, 'invalid format'],
	[403, 'key not valid (key file missing or mismatched)'],
	[422, 'URLs do not belong to the host or the key does not match the schema'],
	[429, 'too many requests (potential spam)'],
]);
const XML_ENTITIES = new Map([
	['&amp;', '&'],
	['&lt;', '<'],
	['&gt;', '>'],
	['&quot;', '"'],
	['&apos;', "'"],
]);

function decodeXmlText(text) {
	return text.trim().replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES.get(entity));
}

function readTag(block, tag) {
	const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
	return match ? decodeXmlText(match[1]) : null;
}

function readBlocks(xml, tag) {
	return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map(
		(match) => match[1],
	);
}

export function isSitemapIndex(xml) {
	return /<sitemapindex[\s>]/.test(xml);
}

export function parseSitemapIndex(xml) {
	return readBlocks(xml, 'sitemap')
		.map((block) => readTag(block, 'loc'))
		.filter(Boolean);
}

export function parseUrlset(xml) {
	const entries = new Map();
	for (const block of readBlocks(xml, 'url')) {
		const loc = readTag(block, 'loc');
		if (loc) {
			entries.set(loc, readTag(block, 'lastmod'));
		}
	}
	return entries;
}

export function isInScope(url) {
	return url.startsWith(SCOPE_PREFIX);
}

let cacheBustSequence = 0;

export function cacheBustedUrl(url) {
	const busted = new URL(url);
	cacheBustSequence += 1;
	busted.searchParams.set(CACHE_BUST_PARAM, `${Date.now()}-${cacheBustSequence}`);
	return busted.toString();
}

async function fetchText(url, fetchFn) {
	const response = await fetchFn(url);
	if (!response.ok) {
		throw new Error(`GET ${url} failed with status ${response.status}`);
	}
	return response.text();
}

export async function fetchSitemapEntries(indexUrl, fetchFn = fetch, depth = 0) {
	if (depth > MAX_SITEMAP_DEPTH) {
		throw new Error(`Sitemap nesting deeper than ${MAX_SITEMAP_DEPTH} at ${indexUrl}`);
	}
	const xml = await fetchText(cacheBustedUrl(indexUrl), fetchFn);
	if (!isSitemapIndex(xml)) {
		return parseUrlset(xml);
	}
	const entries = new Map();
	for (const childUrl of parseSitemapIndex(xml)) {
		if (!childUrl.startsWith(`${SITE_ORIGIN}/`)) {
			throw new Error(`Refusing to fetch child sitemap outside ${SITE_ORIGIN}: ${childUrl}`);
		}
		const childEntries = await fetchSitemapEntries(childUrl, fetchFn, depth + 1);
		for (const [loc, lastmod] of childEntries) {
			entries.set(loc, lastmod);
		}
	}
	return entries;
}

export function diffSitemaps(before, after) {
	const changed = [];
	for (const [loc, lastmod] of after) {
		if (!before.has(loc) || before.get(loc) !== lastmod) {
			changed.push(loc);
		}
	}
	for (const loc of before.keys()) {
		if (!after.has(loc)) {
			changed.push(loc);
		}
	}
	return changed;
}

export function batchUrls(urls, size = BATCH_SIZE) {
	const batches = [];
	for (let start = 0; start < urls.length; start += size) {
		batches.push(urls.slice(start, start + size));
	}
	return batches;
}

export function splitByScope(urls) {
	const inScope = [];
	const rejected = [];
	for (const url of urls) {
		(isInScope(url) ? inScope : rejected).push(url);
	}
	return { inScope, rejected };
}

export function buildPayload(urlList) {
	return { host: HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList };
}

export async function submit(urls, { fetchFn = fetch, dryRun = false, log = console.log } = {}) {
	const { rejected } = splitByScope(urls);
	if (rejected.length > 0) {
		throw new Error(`Refusing to submit URLs outside ${SCOPE_PREFIX}: ${rejected.join(', ')}`);
	}
	const uniqueUrls = [...new Set(urls)];
	const results = [];
	for (const batch of batchUrls(uniqueUrls)) {
		const payload = buildPayload(batch);
		if (dryRun) {
			log(`[dry-run] POST ${INDEXNOW_ENDPOINT} (${batch.length} URLs)`);
			log(JSON.stringify(payload, null, 2));
			results.push({ ok: true, status: null, count: batch.length, dryRun: true });
			continue;
		}
		let status = null;
		try {
			const response = await fetchFn(INDEXNOW_ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json; charset=utf-8' },
				body: JSON.stringify(payload),
			});
			status = response.status;
		} catch (error) {
			log(`IndexNow request failed: ${error.message}`);
			results.push({ ok: false, status: null, count: batch.length });
			continue;
		}
		const ok = SUCCESS_STATUSES.has(status);
		const meaning = STATUS_MEANINGS.get(status);
		log(
			`IndexNow responded ${status} for ${batch.length} URLs${ok ? '' : meaning ? ` - ${meaning}` : ''}`,
		);
		results.push({ ok, status, count: batch.length });
	}
	return results;
}

export function entriesToJson(entries) {
	return JSON.stringify(Object.fromEntries(entries), null, 2);
}

export function entriesFromJson(json) {
	return new Map(Object.entries(JSON.parse(json)));
}

function reportResults(results) {
	const failed = results.filter((result) => !result.ok);
	if (failed.length > 0) {
		console.error(`IndexNow submission failed for ${failed.length} of ${results.length} batches`);
		process.exitCode = 1;
	}
}

async function submitUrls(urls, dryRun) {
	const { inScope, rejected } = splitByScope(urls);
	if (rejected.length > 0) {
		console.warn(
			`Skipping ${rejected.length} URLs outside ${SCOPE_PREFIX}:\n${rejected.join('\n')}`,
		);
	}
	if (inScope.length === 0) {
		console.log('No in-scope URLs to submit');
		return;
	}
	console.log(`Submitting ${inScope.length} URLs:\n${inScope.join('\n')}`);
	reportResults(await submit(inScope, { dryRun }));
}

async function runSnapshot(file) {
	const entries = await fetchSitemapEntries(SITEMAP_INDEX_URL);
	await writeFile(file, entriesToJson(entries));
	console.log(`Snapshot of ${entries.size} sitemap entries written to ${file}`);
}

async function runDiffSubmit(beforeFile, dryRun) {
	const before = entriesFromJson(await readFile(beforeFile, 'utf8'));
	const after = await fetchSitemapEntries(SITEMAP_INDEX_URL);
	const changed = diffSitemaps(before, after);
	if (changed.length === 0) {
		console.log('Sitemap unchanged, nothing to submit');
		return;
	}
	await submitUrls(changed, dryRun);
}

async function runSubmitAll(dryRun) {
	const entries = await fetchSitemapEntries(SITEMAP_INDEX_URL);
	await submitUrls([...entries.keys()], dryRun);
}

export async function main(argv) {
	const dryRun = argv.includes('--dry-run');
	const [mode, file] = argv.filter((arg) => !arg.startsWith('--'));
	if (mode === 'snapshot' && file) {
		return runSnapshot(file);
	}
	if (mode === 'diff-submit' && file) {
		return runDiffSubmit(file, dryRun);
	}
	if (mode === 'submit-all') {
		return runSubmitAll(dryRun);
	}
	console.error(
		'Usage: node scripts/indexnow.mjs <snapshot <file> | diff-submit <beforeFile> | submit-all> [--dry-run]',
	);
	process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
