# Production routing: serving the Worker on the apex

> **Architecture** — The blog is served by the Worker on the **canonical host
> `serhiichernenko.com`** (the bare apex, at base path `/blog`). `www`
> **308-redirects to the apex** via a Cloudflare Redirect Rule that runs before
> Workers. Two DNS records (both **Proxied**) plus that redirect rule make it
> work; the Worker `routes` in `wrangler.jsonc` are bound to the apex only.

---

## www → apex migration

The canonical host moved from `www.serhiichernenko.com` to the bare apex
(**done, 2026-10-12**). A Redirect Rule runs **before** Workers, so the order of
the steps mattered for zero downtime:

1. **Done.** The deploy bound both hosts: every `www.serhiichernenko.com/...`
   route plus the identical `serhiichernenko.com/...` patterns. Build-time URLs
   (sitemap, canonical, RSS, `robots.txt`) became apex.
2. **Done (2026-10-12).** The Redirect Rule was flipped to **www → apex, 308**
   (see _The www → apex Redirect Rule_) and the apex host-root `302` to
   `/blog/en/` was added (see `docs/SEO.md`). Zone `http_request_dynamic_redirect`
   ruleset `3dbd052f46a1486397b3d681d5602160`:
   - www → apex 308 rule `4bfde77c603b463e96fbb87712ce20b2`
   - apex root `/` → `/blog/en/` 302 rule `6e234d678cdd4cec838189114c83331a`
     (delete it when the portfolio Worker takes `/`)
3. **Done.** The `www` routes were removed from `wrangler.jsonc` and `www` from
   `PRODUCTION_HOSTS` in `src/lib/telemetry-schema.ts`. `www` is still
   recognised as an _internal_ referrer (old links redirect through it). The rule
   keeps redirecting `www`; the Worker never sees that host.

`308` (not `301`) keeps the HTTP method and body, so RFC 8058 one-click
unsubscribe POSTs from already-sent emails with `www` links still reach the
Worker.

---

## The moving parts (and who owns each)

| Piece                                                                                                                                   | Where                                                           | Purpose                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Worker routes** → `serhiichernenko.com/blog`, `/blog/*`, `/robots.txt`, `/favicon.ico`, `/llms.txt`, `/llms-full.txt`, `/sitemap.xml` | `wrangler.jsonc` `routes[]` (deployed by `wrangler deploy`)     | Bind the Worker to the canonical host. `zone_name` is the apex `serhiichernenko.com` (the zone) — the _pattern_ selects the host.  |
| **apex DNS record**                                                                                                                     | Cloudflare DNS → `AAAA @ → 100::`, **Proxied**                  | Makes the bare apex resolve to the edge so the Worker routes fire. `100::` is the reserved discard address for an originless host. |
| **`www` DNS record**                                                                                                                    | Cloudflare DNS → `CNAME www → serhiichernenko.com`, **Proxied** | Makes `www` resolve to Cloudflare's edge so the redirect rule can run.                                                             |
| **www → apex redirect**                                                                                                                 | Cloudflare → **Rules → Redirect Rules**                         | 308s `www.serhiichernenko.com/*` → `serhiichernenko.com/*` so visitors on the old host land on the canonical one.                  |
| **Canonical URL**                                                                                                                       | `astro.config.mts` → `site: 'https://serhiichernenko.com'`      | Build-time absolute links (sitemap, RSS, canonical, `robots.txt`) use the apex. Runtime links derive from the request host.        |

**Routes are not DNS.** `wrangler deploy` only binds the Worker to a route
pattern — it never creates a DNS record. If the matched hostname has no proxied
DNS record, requests never reach Cloudflare's edge (Cloudflare's docs:
_"All domains and subdomains must have a DNS record to be proxied on Cloudflare
and used to invoke a Worker."_). Both the apex and `www` therefore need their own
proxied record, as above.

---

## DNS records (both must be **Proxied** / orange cloud)

| Type    | Name  | Content               | Proxy       |
| ------- | ----- | --------------------- | ----------- |
| `AAAA`  | `@`   | `100::`               | **Proxied** |
| `CNAME` | `www` | `serhiichernenko.com` | **Proxied** |

- The records **must be Proxied (orange cloud)** — only proxied traffic runs
  Worker routes / Redirect Rules and gets a Universal SSL cert. A DNS-only
  (grey-cloud) record resolves straight to the discard address and fails.
- `100::` is the reserved IPv6 discard prefix (RFC 6666), Cloudflare's blessed
  placeholder for an originless/Workers host. (Equivalent IPv4: `A @ → 192.0.2.0`
  — the value is `192.0.2.0`, **not** `.1`.)
- Cloudflare hands out **both** IPv4 (A) and IPv6 (AAAA) edge addresses for a
  proxied hostname even though you only created the `AAAA` placeholder — so
  IPv4-only visitors are covered. No extra `A` record is required.

---

## The www → apex Redirect Rule

Dashboard → **Rules → Redirect Rules** (live since 2026-10-12, rule
`4bfde77c603b463e96fbb87712ce20b2`):

- **When incoming requests match:** `Hostname` `equals` `www.serhiichernenko.com`
- **Then... URL redirect → Dynamic:**
  - Expression: `concat("https://serhiichernenko.com", http.request.uri.path)`
  - Preserve query string: **on**
  - Status code: **308**

> Scope the rule to the **`www` hostname only**. Do **not** match all hostnames,
> or `apex → apex` would loop.

> **Why 308, not 301?** 308 is permanent like 301 but preserves the method and
> body. RFC 8058 one-click unsubscribe POSTs from emails already sent with `www`
> links would otherwise be downgraded to GET and fail.

A second rule in the same ruleset (`6e234d678cdd4cec838189114c83331a`) answers
the apex host root `/` with a temporary `302` to `/blog/en/` (see
`docs/SEO.md`). Delete it when the portfolio Worker takes `/`.

> **Why not a Worker Custom Domain instead of routes + redirect?** A Custom Domain
> is hostname-only and captures **all** paths of the host (including `/`), and you
> can't pair it with a path-based route on the same host. Path-based routes keep
> the apex root free for a future landing. Stick with routes.

---

## Adding/​editing DNS via the API (optional)

The `wrangler` OAuth login and the CI `CF_API_TOKEN` have **zone read only** — no
`dns_records:write`. To script DNS, create a scoped token (**My Profile → API
Tokens → Create Token → Zone → DNS → Edit** on `serhiichernenko.com`):

```bash
export CF_DNS_TOKEN='your-zone-dns-edit-token'
ZONE_ID=$(curl -s -H "Authorization: Bearer $CF_DNS_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=serhiichernenko.com" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"][0]["id"])')

# apex placeholder
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_DNS_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"AAAA","name":"@","content":"100::","proxied":true,"ttl":1}'

# www -> apex
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_DNS_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"www","content":"serhiichernenko.com","proxied":true,"ttl":1}'
```

> Don't add DNS write to the Workers Builds deploy credential — DNS and the
> redirect rule are one-time infrastructure actions; widening the deploy
> credential's scope buys nothing.

---

## Deploying a route change

The Worker routes live in `wrangler.jsonc`, but `wrangler deploy` reads the
**built** config that the Astro Cloudflare adapter regenerates into
`dist/server/wrangler.json` at build time. So **a route change only takes effect
after a rebuild + deploy**:

```bash
pnpm wrangler:deploy      # = pnpm build && wrangler deploy  (regenerates the config, then deploys)
```

(Or push to `main` → Cloudflare Workers Builds runs `pnpm build` + deploy.) A
bare `wrangler deploy` without a fresh `pnpm build` will reuse the previously
built routes.

---

## What happens to `/` (host root)

Only `/blog*` and the exact paths `/robots.txt`, `/favicon.ico`, `/llms.txt`,
`/llms-full.txt` and `/sitemap.xml` are bound to the Worker. The **host root `/`**
itself (on the apex)
is unbound — it falls through to the `100::` black hole and returns a
Cloudflare edge error (`522`/`523`/`1016`) until a separate landing ships (open
decision #8 in `blog-build-plan.md`); the temporary apex `302` to `/blog/en/`
from the Redirect Rules bridges the gap. Point uptime monitors at
`https://serhiichernenko.com/blog/en/` (a real `200`), not `/`.

`/robots.txt` is a narrow, deliberate exception to "the root belongs to the
future portfolio Worker": Astro only emits `public/robots.txt` under the
`/blog` base, so without this route the file 522s at the host root and no
crawler ever sees it (`Sitemap:`, `Disallow:`, and `Content-Signal:` lines all
go unread). It's bound at the exact path only — not a `/*` catch-all — so it
doesn't compete with the portfolio Worker's future routes for anything else.
When that Worker ships, move `/robots.txt` ownership to it and delete this
route + the build step in `scripts/post-build.mjs` described below.

`/favicon.ico` follows the same exception: browsers and Google request it at the
host root, so `serhiichernenko.com/favicon.ico` is bound at the exact path
and `scripts/post-build.mjs` copies `dist/client/blog/favicon.ico` to
`dist/client/favicon.ico`. It moves to the portfolio Worker later, together with
`/robots.txt` (delete the route and the copy step then).

**How it's actually served**: NOT by an Astro route or a middleware rewrite.
`context.rewrite()` only resolves to
real Astro routes — `public/robots.txt` is a static file with no route-manifest
entry, and rewriting to it throws at request time ("Unexpectedly unable to find
a component instance"). Instead, `scripts/post-build.mjs` copies the already-
built `dist/client/blog/robots.txt` to `dist/client/robots.txt` (the assets
root) after `astro build` runs. Cloudflare's static-asset serving picks up a
matching file directly, ahead of any Worker code — the same mechanism the apex
`index.html` redirect earlier in that script already relies on. Verify after a
build with `curl -H "Host: serhiichernenko.com" http://localhost:PORT/robots.txt`
against `wrangler dev` (using the actual configured port) — a middleware-based
approach here will silently 500, not fail loudly at build time.

### Host-root `/llms.txt`, `/llms-full.txt` and `/sitemap.xml`

Same deal as `/robots.txt`: three more narrow, exact-path exceptions bound in
`wrangler.jsonc` (never a `/*` catch-all) so crawlers and LLM agents that look
only at the host root find something instead of a 522. **Ownership moves to the
portfolio Worker when it ships**: delete the three routes, the `APEX_ENDPOINTS`
and `SITEMAP_ALIAS_PATHS` handling in `src/middleware.ts`, and have the portfolio
Worker serve (or redirect to) `/blog/llms.txt`, `/blog/llms-full.txt` and
`/blog/sitemap-index.xml` itself.

| Host-root path   | Served by                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/llms.txt`      | SSR route `src/pages/llms.txt.ts`. `src/middleware.ts` calls the route's `GET` handler directly for the host-root request. `context.rewrite('/blog/llms.txt')` is not an option: the rewrite matcher resolves it to the prerendered `/[...locale]/[page]` route and throws "Unexpectedly unable to find a component instance". |
| `/llms-full.txt` | SSR route `src/pages/llms-full.txt.ts`, served by the same direct-handler call.                                                                                                                                                                                                                                                |
| `/sitemap.xml`   | No file or route exists (the sitemap is the SSR route `src/pages/sitemap-index.xml.ts`, served at `/blog/sitemap-index.xml`). `src/middleware.ts` answers a `301` to `https://<host>/blog/sitemap-index.xml`; `/blog/sitemap.xml` gets the same `301`.                                                                         |

Both llms routes stay SSR (not prerendered) so the `Content-Type: text/plain;
charset=utf-8` header survives; see the note at the top of `src/pages/llms.txt.ts`.

### `/blog/` itself

`src/pages/index.ts` is a non-prerendered endpoint that answers `301` to
`/blog/en/`. It must not be prerendered: a static `index.html` would be served
by Cloudflare's static assets before the Worker runs, and the page would be a
meta-refresh instead of a real redirect. `/blog/` is excluded from the sitemap.
The `301` carries `cache-control: public, max-age=3600`.

`i18n.routing.redirectToDefaultLocale` is `false` in `astro.config.mts`: with it
enabled Astro generates its own competing redirect (with an added `noindex` tag)
at the same route, and since Astro 7 changed route-priority resolution that
generated route wins over `src/pages/index.ts`.

`favicon.ico` is copied to the assets root by `scripts/post-build.mjs` for the
same reason as `robots.txt`: Astro only emits `public/` under the `/blog` base,
so the host-root file must be placed there and bound by an exact-path route.

### Trailing slashes

Cloudflare static assets answer a missing trailing slash with a `307`. Every
internal link, canonical, hreflang, JSON-LD URL, RSS link and sitemap URL
therefore uses the trailing-slash form (`localeHref()` / `withPageBase()` in
`src/i18n/utils.ts` add it; `withBase()` is left alone for API paths). Only
final segments with a known asset extension (`xml`, `txt`, `png`, `jpg`, `jpeg`,
`webp`, `avif`, `svg`, `ico`, `webmanifest`, `json`, `css`, `js`, `pdf`) are left
without a slash, so slugs such as `node.js-tips` or `release-v1.2` keep theirs
(`src/lib/trailing-slash.ts`). Unsubscribe and manage URLs follow the same rule
(`/<locale>/unsubscribe/?token=...`); the one-click API route
`/api/unsubscribe` is not a page and stays without a slash.

---

## Verify

No auth required — pure `dig`/`curl`. The helper script wraps all of this:

```bash
./scripts/verify-routing.sh
```

Expected once everything is live (after the routes are deployed and the Redirect
Rule is flipped):

```bash
# 1. the apex resolves to a proxied Cloudflare edge IP (not 100::)
dig +short serhiichernenko.com

# 2. the apex serves the Worker (test http:// first; HTTPS may need up to 24h for the cert)
curl -sS -I http://serhiichernenko.com/blog        # 301 -> /blog/en/ (same host)
curl -sS -I https://serhiichernenko.com/blog/en/   # 200

# 3. www 308-redirects to the apex
curl -sS -I https://www.serhiichernenko.com/blog   # 308 -> https://serhiichernenko.com/blog

# 4. full chain
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://www.serhiichernenko.com/blog
#  -> 200  https://serhiichernenko.com/blog/en/
```

---

## Troubleshooting — "I set it up but it still doesn't work"

### 1. `/blog` returns `522` (Worker not bound to the host, or not redeployed)

The most common cause after switching hosts: the Worker `routes` were changed in
`wrangler.jsonc` but **not redeployed**, so the live Worker is still bound to the
old host. Run `pnpm wrangler:deploy` (a plain `wrangler deploy` without a fresh
`pnpm build` reuses the old built routes — see _Deploying a route change_).
Confirm the deployed routes target the apex only:

```bash
pnpm exec wrangler deploy --dry-run 2>&1 | grep -i serhiichernenko
#  -> serhiichernenko.com/blog, /blog/*, /robots.txt, /favicon.ico, /llms.txt, /llms-full.txt, /sitemap.xml
```

If the apex itself doesn't resolve, check the `AAAA @ → 100::` record exists and
is **Proxied**.

### 2. `www` doesn't redirect to the apex (or 522s without redirecting)

The www→apex **Redirect Rule** is missing or mis-scoped. Recreate it (see
_The www → apex Redirect Rule_). Make sure the `CNAME www → serhiichernenko.com`
record exists and is Proxied — without it `www` doesn't resolve, so the rule
never runs.

### 3. It works on public resolvers but not on your machine (local cache)

`dig @1.1.1.1 serhiichernenko.com` returns an edge IP, but your system
resolver / `curl` says it can't resolve. Your resolver (router/ISP) cached a
**negative** answer from before the record existed; the zone SOA negative-cache
TTL is **1800 s (30 min)**. Fix (any one): wait ≤30 min; point your machine at
`1.1.1.1`/`8.8.8.8`; or flush locally (macOS):
`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` (clears your Mac,
not the router).

### 4. HTTP works but HTTPS fails for a while

The route fires over HTTP within seconds, but **Universal SSL provisions in
15 min–24 h** and the cert is only presented on a proxied hostname. Test
`http://` first; re-test `https://` later.
