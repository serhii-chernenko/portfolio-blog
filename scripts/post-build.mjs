// Post-build: emit a top-level dist/index.html that redirects `/` to `/blog/en/`.
//
// Why: the Worker is route-bound to `chernenko.digital/blog/*` in production, so
// nothing serves the apex `/`. That's correct in prod (the React portfolio at
// chernenko.digital handles it). But during `wrangler dev`, all requests reach
// this Worker, and a bare `/` returns 404, which is jarring.
//
// This file sits outside `dist/blog/` so the prod Worker never serves it
// (its route pattern doesn't match `/`). Locally, wrangler's assets binding
// picks it up before the Worker code runs, giving a clean redirect to `/blog/en/`.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DIST = new URL('../dist/', import.meta.url);

if (!existsSync(DIST)) {
	await mkdir(DIST, { recursive: true });
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=/blog/en/">
<link rel="canonical" href="/blog/en/">
<title>Redirecting…</title>
<script>window.location.replace('/blog/en/')</script>
</head>
<body>
<p>Redirecting to <a href="/blog/en/">/blog/en/</a>…</p>
</body>
</html>
`;

await writeFile(new URL('index.html', DIST), html, 'utf8');
console.log('post-build: wrote dist/index.html (apex → /blog/en/ redirect for local dev)');
