# Production routing: serving the Worker on `www`

> **Architecture** — The blog is served by the Worker on the **canonical host
> `www.serhiichernenko.com`** (at base path `/blog`). The bare apex
> `serhiichernenko.com` **301-redirects to `www`** via a Cloudflare Redirect
> Rule. Two DNS records (both **Proxied**) plus that redirect rule make it work;
> the Worker `routes` in `wrangler.jsonc` are bound to the `www` hostname.

---

## The moving parts (and who owns each)

| Piece                                                                               | Where                                                           | Purpose                                                                                                                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Worker routes** → `www.serhiichernenko.com/blog`, `/blog/*`, `/api/keystatic[/*]` | `wrangler.jsonc` `routes[]` (deployed by `wrangler deploy`)     | Bind the Worker to the canonical host. `zone_name` stays the apex `serhiichernenko.com` (the zone) — the _pattern_ is what targets `www`. |
| **`www` DNS record**                                                                | Cloudflare DNS → `CNAME www → serhiichernenko.com`, **Proxied** | Makes `www` resolve to Cloudflare's edge so the Worker routes fire.                                                                       |
| **apex DNS record**                                                                 | Cloudflare DNS → `AAAA @ → 100::`, **Proxied**                  | Makes the bare apex resolve to the edge so the redirect rule can run. `100::` is the reserved discard address for an originless host.     |
| **apex → www redirect**                                                             | Cloudflare → **Rules → Redirect Rules**                         | 301s `serhiichernenko.com/*` → `www.serhiichernenko.com/*` so visitors who type the bare domain land on the canonical host.               |
| **Canonical URL**                                                                   | `astro.config.mts` → `site: 'https://www.serhiichernenko.com'`  | Build-time absolute links (sitemap, RSS) use `www`. Runtime links derive from the request host.                                           |

**Routes are not DNS.** `wrangler deploy` only binds the Worker to a route
pattern — it never creates a DNS record. If the matched hostname has no proxied
DNS record, requests never reach Cloudflare's edge (Cloudflare's docs:
_"All domains and subdomains must have a DNS record to be proxied on Cloudflare
and used to invoke a Worker."_). Both `www` and the apex therefore need their own
proxied record, as above.

---

## DNS records (both must be **Proxied** / orange cloud)

| Type    | Name  | Content               | Proxy       |
| ------- | ----- | --------------------- | ----------- |
| `CNAME` | `www` | `serhiichernenko.com` | **Proxied** |
| `AAAA`  | `@`   | `100::`               | **Proxied** |

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

## The apex → www Redirect Rule

Dashboard → **Rules → Redirect Rules → Create rule**:

- **When incoming requests match:** `Hostname` `equals` `serhiichernenko.com`
- **Then... URL redirect → Dynamic:**
  - Expression: `concat("https://www.serhiichernenko.com", http.request.uri.path)`
  - Preserve query string: **on**
  - Status code: **301**

> Scope the rule to the **apex hostname only** (`serhiichernenko.com`). Do **not**
> match all hostnames, or `www → www` would loop.

> **Why not a Worker Custom Domain instead of routes + redirect?** A Custom Domain
> is hostname-only and captures **all** paths of `www` (including `/`), and you
> can't pair it with a path-based route on the same host. Path-based routes keep
> `www/` free for a future landing and let the apex redirect cleanly. Stick with
> routes.

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

Only `/blog*` and `/api/keystatic*` are bound to the Worker. The **host root `/`**
(on either `www` or the apex) is unbound — it falls through to the `100::` black
hole and returns a Cloudflare edge error (`522`/`523`/`1016`) until a separate
landing ships (open decision #8 in `blog-build-plan.md`). The apex `/` first
301s to `www/`, which then errors — expected for now. Point uptime monitors at
`https://www.serhiichernenko.com/blog/en/` (a real `200`), not `/`.

---

## Verify

No auth required — pure `dig`/`curl`. The helper script wraps all of this:

```bash
./scripts/verify-routing.sh
```

Expected once everything is live (after the routes are deployed to `www`):

```bash
# 1. www resolves to a proxied Cloudflare edge IP (not 100::)
dig +short www.serhiichernenko.com

# 2. www serves the Worker (test http:// first; HTTPS may need up to 24h for the cert)
curl -sS -I http://www.serhiichernenko.com/blog        # 308 -> /blog/en/ (same host)
curl -sS -I https://www.serhiichernenko.com/blog/en/   # 200

# 3. the bare apex 301-redirects to www
curl -sS -I https://serhiichernenko.com/blog           # 301 -> https://www.serhiichernenko.com/blog

# 4. full chain
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://serhiichernenko.com/blog
#  -> 200  https://www.serhiichernenko.com/blog/en/
```

---

## Troubleshooting — "I set it up but it still doesn't work"

### 1. `www/blog` returns `522` (Worker not bound to www, or not redeployed)

The most common cause after switching hosts: the Worker `routes` were changed in
`wrangler.jsonc` but **not redeployed**, so the live Worker is still bound to the
old host. Run `pnpm wrangler:deploy` (a plain `wrangler deploy` without a fresh
`pnpm build` reuses the old built routes — see _Deploying a route change_).
Confirm the deployed routes target `www`:

```bash
pnpm exec wrangler deploy --dry-run 2>&1 | grep -i serhiichernenko
#  -> www.serhiichernenko.com/blog, /blog/*, /api/keystatic[/*]
```

If `www` itself doesn't resolve, check the `www` CNAME exists and is **Proxied**.

### 2. The apex doesn't redirect to `www` (or 522s without redirecting)

The apex→www **Redirect Rule** is missing or mis-scoped. Recreate it (see
_The apex → www Redirect Rule_). Make sure the apex `AAAA @ → 100::` record
exists and is Proxied — without it the apex doesn't resolve, so the rule never
runs.

### 3. It works on public resolvers but not on your machine (local cache)

`dig @1.1.1.1 www.serhiichernenko.com` returns an edge IP, but your system
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
