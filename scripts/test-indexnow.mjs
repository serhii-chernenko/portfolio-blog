import assert from 'node:assert/strict';
import {
	BATCH_SIZE,
	CACHE_BUST_PARAM,
	HOST,
	INDEXNOW_ENDPOINT,
	INDEXNOW_KEY,
	KEY_LOCATION,
	SCOPE_PREFIX,
	batchUrls,
	buildPayload,
	cacheBustedUrl,
	diffSitemaps,
	entriesFromJson,
	entriesToJson,
	fetchSitemapEntries,
	isInScope,
	parseSitemapIndex,
	parseUrlset,
	submit,
} from './indexnow.mjs';

const INDEX_URL = `${SCOPE_PREFIX}sitemap-index.xml`;
const CHILD_ONE = `${SCOPE_PREFIX}sitemap-0.xml`;
const CHILD_TWO = `${SCOPE_PREFIX}sitemap-1.xml`;
const POST = `${SCOPE_PREFIX}en/posts/hello/`;
const ABOUT = `${SCOPE_PREFIX}en/about/`;
const TAGS = `${SCOPE_PREFIX}en/tags/`;

const indexXml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${CHILD_ONE}</loc><lastmod>2026-05-18T11:43:01.000Z</lastmod></sitemap><sitemap><loc>${CHILD_TWO}</loc></sitemap></sitemapindex>`;
const childOneXml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>${POST}</loc><lastmod>2026-05-18T11:43:01.000Z</lastmod><xhtml:link rel="alternate" hreflang="en" href="${POST}"/></url><url><loc>${ABOUT}</loc></url></urlset>`;
const childTwoXml = `<urlset><url><loc>${TAGS}?a=1&amp;b=2</loc><lastmod>2026-06-01</lastmod></url></urlset>`;

function withoutCacheBust(url) {
	const parsed = new URL(url);
	parsed.searchParams.delete(CACHE_BUST_PARAM);
	return parsed.toString();
}

function fakeFetch(routes) {
	const calls = [];
	const fetchFn = async (rawUrl, init) => {
		const url = withoutCacheBust(rawUrl);
		calls.push({ url, rawUrl, init });
		if (!routes.has(url)) {
			return { ok: false, status: 404, text: async () => '' };
		}
		const route = routes.get(url);
		return { ok: true, status: route.status ?? 200, text: async () => route.body ?? '' };
	};
	return { fetchFn, calls };
}

assert.deepEqual(parseSitemapIndex(indexXml), [CHILD_ONE, CHILD_TWO]);

assert.deepEqual(
	[...parseUrlset(childOneXml)],
	[
		[POST, '2026-05-18T11:43:01.000Z'],
		[ABOUT, null],
	],
	'urlset parsing keeps loc and lastmod, null when lastmod is absent, ignores xhtml:link',
);
assert.equal(
	parseUrlset(childTwoXml).get(`${TAGS}?a=1&b=2`),
	'2026-06-01',
	'XML entities in loc are decoded',
);

{
	const { fetchFn, calls } = fakeFetch(
		new Map([
			[INDEX_URL, { body: indexXml }],
			[CHILD_ONE, { body: childOneXml }],
			[CHILD_TWO, { body: childTwoXml }],
		]),
	);
	const entries = await fetchSitemapEntries(INDEX_URL, fetchFn);
	assert.equal(entries.size, 3, 'sitemapindex is followed into every child urlset');
	assert.equal(entries.get(POST), '2026-05-18T11:43:01.000Z');
	assert.equal(entries.get(ABOUT), null);
	assert.deepEqual(
		calls.map((call) => call.url),
		[INDEX_URL, CHILD_ONE, CHILD_TWO],
	);
	const cacheBusters = calls.map((call) => new URL(call.rawUrl).searchParams.get(CACHE_BUST_PARAM));
	assert.ok(
		cacheBusters.every(Boolean),
		'every sitemap fetch carries a cache-busting query so the edge cache is bypassed',
	);
	assert.equal(new Set(cacheBusters).size, cacheBusters.length, 'cache-busting values are unique');
}

{
	const busted = new URL(cacheBustedUrl(`${INDEX_URL}?existing=1`));
	assert.equal(busted.searchParams.get('existing'), '1', 'existing query parameters are kept');
	assert.ok(busted.searchParams.get(CACHE_BUST_PARAM), 'the cache-busting parameter is added');
	assert.equal(withoutCacheBust(busted.toString()), `${INDEX_URL}?existing=1`);
}

{
	const { fetchFn } = fakeFetch(new Map([[INDEX_URL, { body: childOneXml }]]));
	const entries = await fetchSitemapEntries(INDEX_URL, fetchFn);
	assert.equal(entries.size, 2, 'a plain urlset is parsed without following anything');
}

{
	const { fetchFn } = fakeFetch(new Map());
	await assert.rejects(
		fetchSitemapEntries(INDEX_URL, fetchFn),
		/status 404/,
		'a non-2xx sitemap response fails loudly',
	);
}

{
	const foreignIndex = `<sitemapindex><sitemap><loc>https://evil.example/sitemap.xml</loc></sitemap></sitemapindex>`;
	const { fetchFn, calls } = fakeFetch(new Map([[INDEX_URL, { body: foreignIndex }]]));
	await assert.rejects(fetchSitemapEntries(INDEX_URL, fetchFn), /Refusing to fetch child sitemap/);
	assert.equal(calls.length, 1, 'foreign child sitemaps are never requested');
}

{
	const legacyIndex = `<sitemapindex><sitemap><loc>https://www.${HOST}/blog/sitemap-0.xml</loc></sitemap></sitemapindex>`;
	const { fetchFn, calls } = fakeFetch(new Map([[INDEX_URL, { body: legacyIndex }]]));
	await assert.rejects(fetchSitemapEntries(INDEX_URL, fetchFn), /Refusing to fetch child sitemap/);
	assert.equal(calls.length, 1, 'the legacy www host is refused like any foreign origin');
}

{
	const selfReferencing = `<sitemapindex><sitemap><loc>${INDEX_URL}</loc></sitemap></sitemapindex>`;
	const { fetchFn } = fakeFetch(new Map([[INDEX_URL, { body: selfReferencing }]]));
	await assert.rejects(fetchSitemapEntries(INDEX_URL, fetchFn), /nesting deeper/);
}

{
	const before = new Map([
		[POST, '2026-05-18'],
		[ABOUT, null],
		[TAGS, '2026-01-01'],
	]);
	const unchanged = new Map(before);
	assert.deepEqual(diffSitemaps(before, unchanged), [], 'identical sitemaps produce no changes');

	const NEW_POST = `${SCOPE_PREFIX}en/posts/new/`;
	const after = new Map([
		[POST, '2026-07-01'],
		[ABOUT, null],
		[NEW_POST, null],
	]);
	assert.deepEqual(
		diffSitemaps(before, after),
		[POST, NEW_POST, TAGS],
		'changed lastmod and new URLs come first, removed URLs last',
	);

	assert.deepEqual(
		diffSitemaps(new Map([[ABOUT, null]]), new Map([[ABOUT, '2026-07-01']])),
		[ABOUT],
		'null to a lastmod counts as changed',
	);
	assert.deepEqual(
		diffSitemaps(new Map([[ABOUT, '2026-07-01']]), new Map([[ABOUT, null]])),
		[ABOUT],
		'a lastmod to null counts as changed',
	);
	assert.deepEqual(
		diffSitemaps(new Map([[ABOUT, null]]), new Map([[ABOUT, null]])),
		[],
		'null lastmod on both sides is unchanged',
	);
	assert.deepEqual(diffSitemaps(new Map(), new Map([[ABOUT, null]])), [ABOUT], 'new URL');
	assert.deepEqual(diffSitemaps(new Map([[ABOUT, null]]), new Map()), [ABOUT], 'removed URL');
}

{
	const entries = new Map([
		[POST, '2026-05-18'],
		[ABOUT, null],
	]);
	assert.deepEqual(entriesFromJson(entriesToJson(entries)), entries, 'snapshot JSON round-trips');
}

assert.equal(isInScope(POST), true);
assert.equal(
	isInScope(`https://${HOST}/blog`),
	false,
	'the bare /blog path is outside the key scope',
);
assert.equal(isInScope(`https://${HOST}/`), false);
assert.equal(isInScope('https://example.com/blog/en/'), false);
assert.equal(isInScope(`http://${HOST}/blog/en/`), false, 'http scheme is rejected');
assert.equal(isInScope(`https://${HOST}.evil.example/blog/en/`), false);
assert.equal(
	isInScope(`https://www.${HOST}/blog/en/`),
	false,
	'the www host is outside the key scope',
);

assert.deepEqual(batchUrls([]), []);
assert.deepEqual(batchUrls(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
{
	const urls = Array.from(
		{ length: BATCH_SIZE * 2 + 1 },
		(_, index) => `${SCOPE_PREFIX}p/${index}/`,
	);
	assert.deepEqual(
		batchUrls(urls).map((batch) => batch.length),
		[BATCH_SIZE, BATCH_SIZE, 1],
		'default batch size is 10,000',
	);
}

assert.deepEqual(buildPayload([POST]), {
	host: HOST,
	key: INDEXNOW_KEY,
	keyLocation: KEY_LOCATION,
	urlList: [POST],
});
assert.equal(KEY_LOCATION, `${SCOPE_PREFIX}${INDEXNOW_KEY}.txt`);

{
	const { fetchFn, calls } = fakeFetch(new Map([[INDEXNOW_ENDPOINT, { status: 202 }]]));
	const results = await submit([POST, POST, ABOUT], { fetchFn, log: () => {} });
	assert.deepEqual(results, [{ ok: true, status: 202, count: 2 }], 'duplicates are collapsed');
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.headers['content-type'], 'application/json; charset=utf-8');
	assert.deepEqual(JSON.parse(calls[0].init.body), buildPayload([POST, ABOUT]));
}

{
	const { fetchFn } = fakeFetch(new Map([[INDEXNOW_ENDPOINT, { status: 200 }]]));
	const results = await submit([POST], { fetchFn, log: () => {} });
	assert.equal(results[0].ok, true, '200 is success');
}

for (const status of [400, 403, 422, 429, 500]) {
	const { fetchFn } = fakeFetch(new Map([[INDEXNOW_ENDPOINT, { status }]]));
	const logged = [];
	const results = await submit([POST], { fetchFn, log: (line) => logged.push(line) });
	assert.equal(results[0].ok, false, `${status} is a failure`);
	assert.equal(results[0].status, status);
	assert.ok(
		logged.some((line) => line.includes(String(status))),
		`${status} is logged`,
	);
}

{
	const failingFetch = async () => {
		throw new Error('network down');
	};
	const results = await submit([POST], { fetchFn: failingFetch, log: () => {} });
	assert.deepEqual(results, [{ ok: false, status: null, count: 1 }], 'network errors are failures');
}

{
	const { fetchFn, calls } = fakeFetch(new Map([[INDEXNOW_ENDPOINT, { status: 200 }]]));
	await assert.rejects(
		submit([POST, 'https://example.com/blog/en/'], { fetchFn, log: () => {} }),
		/Refusing to submit URLs outside/,
	);
	await assert.rejects(
		submit([`https://${HOST}/`], { fetchFn, log: () => {} }),
		/Refusing to submit URLs outside/,
		'the host root is outside the key scope',
	);
	assert.equal(calls.length, 0, 'nothing is POSTed when any URL is out of scope');
}

{
	const urls = Array.from({ length: BATCH_SIZE + 5 }, (_, index) => `${SCOPE_PREFIX}p/${index}/`);
	const { fetchFn, calls } = fakeFetch(new Map([[INDEXNOW_ENDPOINT, { status: 200 }]]));
	const results = await submit(urls, { fetchFn, log: () => {} });
	assert.deepEqual(
		results.map((result) => result.count),
		[BATCH_SIZE, 5],
	);
	assert.equal(calls.length, 2, 'one POST per batch');
}

{
	const { fetchFn, calls } = fakeFetch(new Map());
	const logged = [];
	const results = await submit([POST], { fetchFn, dryRun: true, log: (line) => logged.push(line) });
	assert.equal(calls.length, 0, 'dry run never calls fetch');
	assert.equal(results[0].dryRun, true);
	assert.deepEqual(JSON.parse(logged[1]), buildPayload([POST]), 'dry run prints the payload');
}

console.log('indexnow tests passed');
