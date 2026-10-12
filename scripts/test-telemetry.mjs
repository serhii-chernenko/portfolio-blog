import assert from 'node:assert/strict';
import {
	browserLanguage,
	campaignSource,
	clientEventAttributes,
	countryCode,
	deviceType,
	enabledLanguages,
	engagedBucket,
	environmentFromHost,
	isCrawler,
	isUntrackedRoute,
	newsletterOutcome,
	newsletterSource,
	normalizeRoute,
	outboundSource,
	parseClientEvent,
	rateLimitKey,
	referrerSource,
	resultsBucket,
	scrollBucket,
	shouldEmitHttpEvent,
	httpOutcome,
} from '../src/lib/telemetry-schema.ts';

const SESSION_ID = '3f2b8a52-6a4e-4c1d-9b1a-0f6f2f1c7e11';
const OWN_HOST = 'serhiichernenko.com';
const common = { sessionId: SESSION_ID, locale: 'en', pageType: 'post', contentKey: 'my-post' };
const pageView = {
	type: 'page_view',
	...common,
	referrerHost: 'www.google.com',
	utmSource: 'Newsletter',
	browserLanguage: 'uk',
	theme: 'dark',
	pageIndex: 1,
};

assert.deepEqual(parseClientEvent(pageView), { ...pageView, sessionId: SESSION_ID });
assert.equal(parseClientEvent({ ...pageView, extra: 'x' }), null, 'unknown keys are rejected');
assert.equal(
	parseClientEvent({ ...pageView, activeSeconds: 5 }),
	null,
	'foreign-type keys are rejected',
);
assert.equal(parseClientEvent(JSON.parse('{"__proto__":{"a":1},"type":"page_view"}')), null);
for (const invalid of [null, undefined, 'page_view', 42, [], [pageView]]) {
	assert.equal(parseClientEvent(invalid), null);
}
assert.equal(parseClientEvent({ ...pageView, type: 'unknown' }), null);
assert.equal(parseClientEvent({ ...pageView, sessionId: 'not-a-uuid' }), null);
assert.equal(parseClientEvent({ ...pageView, sessionId: 'a@b.co' }), null);
assert.equal(parseClientEvent({ ...pageView, locale: 'de' }), null);
assert.equal(parseClientEvent({ ...pageView, pageType: 'admin' }), null);
assert.equal(parseClientEvent({ ...pageView, theme: 'sepia' }), null);
assert.equal(parseClientEvent({ ...pageView, pageIndex: 0 }), null);
assert.equal(parseClientEvent({ ...pageView, pageIndex: 501 }), null);
assert.equal(parseClientEvent({ ...pageView, pageIndex: 1.5 }), null);
assert.equal(parseClientEvent({ ...pageView, pageIndex: '1' }), null);
assert.equal(parseClientEvent({ ...pageView, contentKey: 'x'.repeat(129) }), null);
assert.equal(parseClientEvent({ ...pageView, contentKey: 'https://example.com/a' }), null);
assert.equal(parseClientEvent({ ...pageView, contentKey: 'user@example.com' }), null);
assert.equal(parseClientEvent({ ...pageView, contentKey: '' }), null);
const overlong = 'x'.repeat(257);
assert.equal(parseClientEvent({ ...pageView, referrerHost: overlong }).referrerHost, 'other');
assert.equal(parseClientEvent({ ...pageView, referrerHost: 7 }).referrerHost, 'other');
assert.equal(parseClientEvent({ ...pageView, utmSource: overlong }).utmSource, 'other');
assert.equal(parseClientEvent({ ...pageView, utmSource: null }).utmSource, 'other');
assert.equal(parseClientEvent({ ...pageView, utmSource: { a: 1 } }).utmSource, 'other');
assert.equal(parseClientEvent({ ...pageView, browserLanguage: overlong }).browserLanguage, 'other');
assert.equal(parseClientEvent({ ...pageView, browserLanguage: ['en'] }).browserLanguage, 'other');
assert.equal('utmSource' in parseClientEvent({ ...pageView, utmSource: '' }), false);
assert.equal('referrerHost' in parseClientEvent({ ...pageView, referrerHost: '' }), false);
assert.equal(
	'browserLanguage' in parseClientEvent({ ...pageView, browserLanguage: undefined }),
	false,
);
const degraded = clientEventAttributes(
	parseClientEvent({
		...pageView,
		referrerHost: overlong,
		utmSource: overlong,
		browserLanguage: overlong,
	}),
	{ ownHost: OWN_HOST, country: 'UA', deviceType: 'mobile' },
);
assert.equal(degraded.referrerSource, 'other');
assert.equal(degraded.campaignSource, 'other');
assert.equal(degraded.browserLanguage, 'other');
assert.equal(
	parseClientEvent({ ...pageView, sessionId: SESSION_ID.toUpperCase() }).sessionId,
	SESSION_ID,
);

const withoutOptionals = { type: 'page_view', ...common, theme: 'light', pageIndex: 3 };
assert.deepEqual(parseClientEvent(withoutOptionals), {
	...withoutOptionals,
	sessionId: SESSION_ID,
});
const { contentKey: _omitted, ...withoutContentKey } = common;
assert.equal(
	'contentKey' in
		parseClientEvent({ type: 'page_view', ...withoutContentKey, theme: 'light', pageIndex: 1 }),
	false,
);

const engaged = { type: 'page_engaged', ...common, activeSeconds: 42.9, scrollDepth: 80 };
assert.equal(parseClientEvent(engaged).activeSeconds, 42);
assert.equal(parseClientEvent({ ...engaged, activeSeconds: 99_999 }).activeSeconds, 3600);
assert.equal(parseClientEvent({ ...engaged, activeSeconds: -1 }), null);
assert.equal(parseClientEvent({ ...engaged, activeSeconds: Number.NaN }), null);
assert.equal(parseClientEvent({ ...engaged, scrollDepth: 101 }), null);
assert.equal(parseClientEvent({ ...engaged, scrollDepth: -1 }), null);
assert.equal(parseClientEvent({ ...engaged, scrollDepth: '80' }), null);
assert.equal(parseClientEvent({ type: 'page_engaged', ...common, activeSeconds: 5 }), null);

const switched = { type: 'language_switched', ...common, targetLocale: 'uk' };
assert.equal(parseClientEvent(switched).targetLocale, 'uk');
assert.equal(parseClientEvent({ ...switched, targetLocale: 'fr' }), null);
assert.equal(parseClientEvent({ type: 'language_switched', ...common }), null);

const search = { type: 'search_used', ...common, resultsCount: 7 };
assert.equal(parseClientEvent(search).resultsCount, 7);
assert.equal(parseClientEvent({ ...search, resultsCount: -1 }), null);
assert.equal(parseClientEvent({ ...search, resultsCount: 2.5 }), null);
assert.equal(
	parseClientEvent({ ...search, query: 'secret' }),
	null,
	'the search query is never accepted',
);

const outbound = { type: 'outbound_clicked', ...common, targetHost: 't.co' };
assert.equal(parseClientEvent(outbound).targetHost, 't.co');
assert.equal(parseClientEvent({ ...outbound, targetHost: '' }), null);
assert.equal(parseClientEvent({ ...outbound, targetHost: overlong }).targetHost, 'other');
assert.equal(parseClientEvent({ ...outbound, targetHost: 42 }).targetHost, 'other');
assert.equal(
	clientEventAttributes(parseClientEvent({ ...outbound, targetHost: overlong }), {
		ownHost: OWN_HOST,
		country: 'UA',
		deviceType: 'mobile',
	}).targetSource,
	'other',
);
assert.equal(parseClientEvent({ ...outbound, url: 'https://t.co/x' }), null);
assert.equal(parseClientEvent({ type: 'outbound_clicked', ...common }), null);

assert.equal(engagedBucket(0), 'lt10s');
assert.equal(engagedBucket(9), 'lt10s');
assert.equal(engagedBucket(10), 's10to30');
assert.equal(engagedBucket(29), 's10to30');
assert.equal(engagedBucket(30), 's30to120');
assert.equal(engagedBucket(119), 's30to120');
assert.equal(engagedBucket(120), 'm2to5');
assert.equal(engagedBucket(299), 'm2to5');
assert.equal(engagedBucket(300), 'm5plus');
assert.equal(engagedBucket(3600), 'm5plus');

assert.equal(scrollBucket(0), 'p0');
assert.equal(scrollBucket(24), 'p0');
assert.equal(scrollBucket(25), 'p25');
assert.equal(scrollBucket(49), 'p25');
assert.equal(scrollBucket(50), 'p50');
assert.equal(scrollBucket(74), 'p50');
assert.equal(scrollBucket(75), 'p75');
assert.equal(scrollBucket(94), 'p75');
assert.equal(scrollBucket(95), 'p100');
assert.equal(scrollBucket(100), 'p100');

assert.equal(resultsBucket(0), 'none');
assert.equal(resultsBucket(1), 'oneToFive');
assert.equal(resultsBucket(5), 'oneToFive');
assert.equal(resultsBucket(6), 'sixPlus');
assert.equal(resultsBucket(500), 'sixPlus');

const referrerCases = [
	[undefined, 'direct'],
	['', 'direct'],
	['google.com', 'google'],
	['www.google.com', 'google'],
	['google.com.ua', 'google'],
	['www.google.co.uk', 'google'],
	['news.google.com', 'google'],
	['mail.google.com', 'other'],
	['docs.google.com', 'other'],
	['drive.google.com', 'other'],
	['accounts.google.com', 'other'],
	['mail.google.co.uk', 'other'],
	['www.mail.google.com', 'other'],
	['mail.yandex.ru', 'other'],
	['mail.yandex.com.tr', 'other'],
	['google.evil.com', 'other'],
	['notgoogle.com', 'other'],
	['www.bing.com', 'bing'],
	['duckduckgo.com', 'duckduckgo'],
	['yandex.ru', 'yandex'],
	['yandex.com.tr', 'yandex'],
	['www.linkedin.com', 'linkedin'],
	['lnkd.in', 'linkedin'],
	['dou.ua', 'dou'],
	['jobs.dou.ua', 'dou'],
	['t.me', 'telegram'],
	['web.telegram.org', 'telegram'],
	['t.co', 'x'],
	['x.com', 'x'],
	['twitter.com', 'x'],
	['evilt.co', 'other'],
	['l.facebook.com', 'facebook'],
	['m.facebook.com', 'facebook'],
	['github.com', 'github'],
	['old.reddit.com', 'reddit'],
	['news.ycombinator.com', 'hackernews'],
	['ycombinator.com', 'other'],
	['chatgpt.com', 'chatgpt'],
	['chat.openai.com', 'chatgpt'],
	['www.perplexity.ai', 'perplexity'],
	['example.org', 'other'],
	['serhiichernenko.com', 'internal'],
	['www.serhiichernenko.com', 'internal'],
	['WWW.SERHIICHERNENKO.COM.', 'internal'],
	['https://www.google.com/search?q=secret', 'other'],
	['user@example.com', 'other'],
	['192.168.0.1', 'other'],
];
for (const [host, expected] of referrerCases) {
	assert.equal(referrerSource(host, OWN_HOST), expected, `referrer ${host}`);
}
assert.equal(referrerSource('localhost', 'localhost:8787'), 'internal');
assert.equal(referrerSource('www.google.com', 'localhost:8787'), 'google');
assert.equal(referrerSource('serhiichernenko.com', 'localhost:8787'), 'internal');
assert.equal(referrerSource('www.serhiichernenko.com', 'localhost:8787'), 'internal');
assert.equal(outboundSource('l.facebook.com'), 'facebook');
assert.equal(outboundSource('example.org'), 'other');
assert.equal(outboundSource('https://github.com/x/y'), 'other');

assert.equal(campaignSource(undefined), undefined);
assert.equal(campaignSource(''), undefined);
assert.equal(campaignSource('Newsletter'), 'newsletter');
const allowedCampaigns = [
	'linkedin',
	'dou',
	'telegram',
	'x',
	'twitter',
	'facebook',
	'threads',
	'mastodon',
	'bluesky',
	'reddit',
	'hackernews',
	'github',
	'devto',
	'medium',
	'newsletter',
	'email',
	'google',
	'youtube',
	'discord',
	'slack',
];
for (const source of allowedCampaigns) {
	assert.equal(campaignSource(source), source, source);
	assert.equal(campaignSource(source.toUpperCase()), source, source);
}
assert.equal(campaignSource('dou_ua-2026.q1'), 'other');
assert.equal(campaignSource('spring-sale'), 'other');
assert.equal(campaignSource('other'), 'other');
assert.equal(campaignSource('linkedin2'), 'other');
assert.equal(campaignSource('person@example.com'), 'other');
assert.equal(campaignSource('https://example.com/path'), 'other');
assert.equal(campaignSource('example.com/path'), 'other');
assert.equal(campaignSource('a'.repeat(33)), 'other');
assert.equal(campaignSource('has space'), 'other');

assert.equal(browserLanguage(undefined), undefined);
assert.equal(browserLanguage('uk'), 'uk');
assert.equal(browserLanguage('EN'), 'en');
assert.equal(browserLanguage('en-US'), 'en');
assert.equal(browserLanguage('fil'), 'fil');
assert.equal(browserLanguage('person@example.com'), 'other');
assert.equal(browserLanguage('https://example.com'), 'other');
assert.equal(browserLanguage('english'), 'other');
assert.equal(browserLanguage('x'), 'other');
assert.equal(browserLanguage('a'.repeat(100)), 'other');

assert.equal(countryCode('UA'), 'UA');
assert.equal(countryCode('ua'), 'UA');
assert.equal(countryCode('T1'), 'T1');
assert.equal(countryCode('XX'), 'XX');
assert.equal(countryCode(null), 'XX');
assert.equal(countryCode('Ukraine'), 'XX');
assert.equal(countryCode('1.2.3.4'), 'XX');

assert.equal(environmentFromHost('serhiichernenko.com'), 'production');
assert.equal(environmentFromHost('SERHIICHERNENKO.COM:443'), 'production');
assert.equal(environmentFromHost('www.serhiichernenko.com'), 'preview');
assert.equal(environmentFromHost('WWW.SERHIICHERNENKO.COM:443'), 'preview');
assert.equal(environmentFromHost('localhost:8787'), 'development');
assert.equal(environmentFromHost('127.0.0.1:4321'), 'development');
assert.equal(environmentFromHost('portfolio-blog.example.workers.dev'), 'preview');
assert.equal(environmentFromHost('serhiichernenko.com.evil.test'), 'preview');
assert.equal(environmentFromHost('blog.serhiichernenko.com'), 'preview');
assert.equal(environmentFromHost('www.serhiichernenko.com.evil.test'), 'preview');

const chromeDesktop =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const iphone =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ipad =
	'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const androidPhone =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const androidTablet =
	'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const cubotPhone =
	'Mozilla/5.0 (Linux; Android 12; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const duckDuckGoAndroid =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 DuckDuckGo/5';
const duckDuckGoIos =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15';
const crawlerAgents = [
	'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
	'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
	'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
	'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
	'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
	'DuckDuckGo-Favicons-Bot/1.0',
	'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 HeadlessChrome/126.0.0.0 Safari/537.36',
	'Mozilla/5.0 Chrome-Lighthouse',
	'facebookexternalhit/1.1',
	'curl/8.4.0',
	'python-requests/2.31.0',
	'Go-http-client/2.0',
	'Wget/1.21',
	'Slackbot-LinkExpanding 1.0',
	'Twitterbot/1.0',
	'UptimeRobot/2.0',
	'node-fetch/1.0',
];
for (const agent of crawlerAgents) assert.equal(isCrawler(agent), true, agent);
for (const agent of [
	chromeDesktop,
	iphone,
	ipad,
	androidPhone,
	androidTablet,
	cubotPhone,
	duckDuckGoAndroid,
	duckDuckGoIos,
]) {
	assert.equal(isCrawler(agent), false, agent);
}
assert.equal(isCrawler(null), true);
assert.equal(isCrawler(''), true);

assert.equal(deviceType(chromeDesktop), 'desktop');
assert.equal(deviceType(iphone), 'mobile');
assert.equal(deviceType(ipad), 'tablet');
assert.equal(deviceType(androidPhone), 'mobile');
assert.equal(deviceType(androidTablet), 'tablet');
assert.equal(deviceType(null), 'desktop');

const routeCases = [
	['/blog/api/subscribe', '/blog', '/api/subscribe'],
	['/blog/api/subscribe/', '/blog', '/api/subscribe'],
	['/blog/api/confirm', '/blog', '/api/confirm'],
	['/blog/api/unsubscribe', '/blog', '/api/unsubscribe'],
	['/blog/api/mcp', '/blog', '/api/mcp'],
	['/blog/api/emails/templates', '/blog', '/api/emails/templates'],
	['/blog/api/emails/templates/welcome', '/blog', '/api/emails/templates/:slug'],
	['/blog/admin/emails', '/blog', '/admin/emails'],
	['/blog/admin/emails/welcome', '/blog', '/admin/emails/:slug'],
	['/blog/en/unsubscribe', '/blog', '/:locale/unsubscribe'],
	['/blog/uk/unsubscribe', '/blog', '/:locale/unsubscribe'],
	['/blog/llms.txt', '/blog', '/llms.txt'],
	['/blog/llms-full.txt', '/blog', '/llms-full.txt'],
	['/api/subscribe', '/', '/api/subscribe'],
	['/en/unsubscribe', '/', '/:locale/unsubscribe'],
	['/llms.txt', '', '/llms.txt'],
	['/llms-full.txt', '', '/llms-full.txt'],
	['/blog/does-not-exist', '/blog', '/unknown'],
	['/blog', '/blog', '/unknown'],
	['/blog/de/unsubscribe', '/blog', '/unknown'],
	['/api/subscribe', '/blog', '/api/subscribe'],
	['/blog/api/subscribe/extra', '/blog', '/unknown'],
	['/blog/api/emails/templates/a/b', '/blog', '/unknown'],
];
for (const [pathname, base, expected] of routeCases) {
	assert.equal(normalizeRoute(pathname, base), expected, `${base} ${pathname}`);
}
const leakyPathnames = [
	'/blog/api/confirm/SECRET-TOKEN',
	'/blog/en/unsubscribe/SECRET-TOKEN',
	'/blog/api/emails/templates/SECRET-TOKEN',
	'/blog/admin/emails/SECRET-TOKEN',
	'/blog/random/SECRET-TOKEN',
];
for (const pathname of leakyPathnames) {
	assert.equal(normalizeRoute(pathname, '/blog').includes('SECRET-TOKEN'), false, pathname);
}
assert.equal(
	normalizeRoute(
		new URL('/blog/api/confirm?token=SECRET&locale=en', 'https://x.test').pathname,
		'/blog',
	),
	'/api/confirm',
);

assert.equal(isUntrackedRoute('/blog/api/events', '/blog'), true);
assert.equal(isUntrackedRoute('/api/events', '/'), true);
assert.equal(isUntrackedRoute('/api/keystatic/github/login', '/blog'), true);
assert.equal(isUntrackedRoute('/blog/api/keystatic/github/login', '/blog'), true);
assert.equal(isUntrackedRoute('/keystatic/branch/main', '/blog'), true);
assert.equal(isUntrackedRoute('/blog/keystatic', '/blog'), true);
assert.equal(isUntrackedRoute('/blog/api/subscribe', '/blog'), false);

assert.equal(rateLimitKey('203.0.113.7'), '203.0.113.7');
assert.equal(rateLimitKey(null), 'unknown');
assert.equal(rateLimitKey(undefined), 'unknown');
assert.equal(rateLimitKey(''), 'unknown');
const ipv6Key = rateLimitKey('2001:db8:1:2:3:4:5:6');
assert.equal(ipv6Key, '2001:0db8:0001:0002::/64');
assert.equal(rateLimitKey('2001:DB8:1:2:ffff:ffff:ffff:ffff'), ipv6Key);
assert.equal(rateLimitKey('2001:db8:1:2::1'), ipv6Key);
assert.equal(rateLimitKey('2001:db8:1:2::'), ipv6Key);
assert.notEqual(rateLimitKey('2001:db8:1:3::1'), ipv6Key);
assert.equal(rateLimitKey('2001:db8::1'), rateLimitKey('2001:db8:0:0:9:9:9:9'));
assert.equal(rateLimitKey('2001:db8::1'), '2001:0db8:0000:0000::/64');
assert.equal(rateLimitKey('::1'), '0000:0000:0000:0000::/64');
assert.equal(rateLimitKey('::'), '0000:0000:0000:0000::/64');
assert.equal(rateLimitKey('::ffff:192.0.2.1'), '192.0.2.1');
assert.equal(rateLimitKey('::ffff:c000:201'), '192.0.2.1');
assert.equal(rateLimitKey('fe80::1:2:3:4'), 'fe80:0000:0000:0000::/64');
assert.equal(rateLimitKey('1:2:3:4:5:6:7::'), '0001:0002:0003:0004::/64');
assert.equal(rateLimitKey('1::2::3'), '1::2::3', 'malformed addresses fall back to the raw value');
assert.equal(rateLimitKey('1:2:3:4:5:6:7:8:9'), '1:2:3:4:5:6:7:8:9');
assert.equal(rateLimitKey('gggg::1'), 'gggg::1');

assert.equal(shouldEmitHttpEvent('/unknown', 200), false);
assert.equal(shouldEmitHttpEvent('/unknown', 404), false);
assert.equal(shouldEmitHttpEvent('/unknown', 499), false);
assert.equal(shouldEmitHttpEvent('/unknown', 500), true);
assert.equal(shouldEmitHttpEvent('/unknown', 503), true);
for (const route of ['/api/subscribe', '/api/confirm', '/api/unsubscribe']) {
	assert.equal(shouldEmitHttpEvent(route, 200), false, route);
	assert.equal(shouldEmitHttpEvent(route, 303), false, route);
	assert.equal(shouldEmitHttpEvent(route, 400), false, route);
	assert.equal(shouldEmitHttpEvent(route, 500), true, route);
}
for (const route of [
	'/api/mcp',
	'/api/emails/templates/:slug',
	'/admin/emails',
	'/:locale/unsubscribe',
	'/llms.txt',
	'/llms-full.txt',
]) {
	assert.equal(shouldEmitHttpEvent(route, 200), true, route);
	assert.equal(shouldEmitHttpEvent(route, 404), true, route);
	assert.equal(shouldEmitHttpEvent(route, 500), true, route);
}
assert.equal(httpOutcome(200), 'success');
assert.equal(httpOutcome(302), 'success');
assert.equal(httpOutcome(400), 'rejected');
assert.equal(httpOutcome(403), 'rejected');
assert.equal(httpOutcome(404), 'rejected');
assert.equal(httpOutcome(429), 'rejected');
assert.equal(httpOutcome(499), 'rejected');
assert.equal(httpOutcome(500), 'error');
assert.equal(httpOutcome(503), 'error');

assert.equal(enabledLanguages({ en: true, uk: true }), 'both');
assert.equal(enabledLanguages({ en: true, uk: false }), 'en');
assert.equal(enabledLanguages({ en: false, uk: true }), 'uk');
assert.equal(enabledLanguages({ en: false, uk: false }), 'none');
assert.equal(newsletterSource('home'), 'home');
assert.equal(newsletterSource('inline'), 'inline');
assert.equal(newsletterSource('subscribe-page'), 'subscribe-page');
assert.equal(newsletterSource('person@example.com'), 'other');
assert.equal(newsletterSource(undefined), 'other');
assert.equal(newsletterOutcome('pending'), 'success');
assert.equal(newsletterOutcome('changed'), 'success');
assert.equal(newsletterOutcome('invalid_token'), 'rejected');
assert.equal(newsletterOutcome('rate_limited'), 'rejected');
assert.equal(newsletterOutcome('unavailable'), 'error');
assert.equal(newsletterOutcome('email_failed'), 'error');

const context = { ownHost: OWN_HOST, country: 'UA', deviceType: 'mobile' };
assert.deepEqual(clientEventAttributes(parseClientEvent(pageView), context), {
	eventName: 'page_view',
	outcome: 'success',
	sessionId: SESSION_ID,
	locale: 'en',
	pageType: 'post',
	contentKey: 'my-post',
	country: 'UA',
	deviceType: 'mobile',
	referrerSource: 'google',
	campaignSource: 'newsletter',
	browserLanguage: 'uk',
	theme: 'dark',
	pageIndex: 1,
	isEntry: true,
});
assert.equal(
	clientEventAttributes(parseClientEvent({ ...pageView, pageIndex: 2 }), context).isEntry,
	false,
);
assert.deepEqual(clientEventAttributes(parseClientEvent(engaged), context), {
	eventName: 'page_engaged',
	outcome: 'success',
	sessionId: SESSION_ID,
	locale: 'en',
	pageType: 'post',
	contentKey: 'my-post',
	country: 'UA',
	deviceType: 'mobile',
	engagedBucket: 's30to120',
	activeSeconds: 42,
	scrollBucket: 'p75',
});
assert.equal(clientEventAttributes(parseClientEvent(switched), context).targetLocale, 'uk');
assert.equal(clientEventAttributes(parseClientEvent(search), context).resultsBucket, 'sixPlus');
assert.equal(clientEventAttributes(parseClientEvent(outbound), context).targetSource, 'x');
assert.equal(
	clientEventAttributes(parseClientEvent(outbound), context).eventName,
	'outbound_clicked',
);

const hostileEvent = parseClientEvent({
	...pageView,
	referrerHost: 'https://example.com/private?email=a@b.co',
	utmSource: 'a@b.co',
	browserLanguage: 'a@b.co',
});
const serialized = JSON.stringify(clientEventAttributes(hostileEvent, context));
assert.equal(serialized.includes('@'), false);
assert.equal(serialized.includes('example.com'), false);
assert.equal(serialized.includes('private'), false);

console.log('telemetry schema tests passed');
