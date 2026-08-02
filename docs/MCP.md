# MCP server

This blog exposes a read-only [Model Context Protocol](https://modelcontextprotocol.io)
server so AI assistants can query post content directly instead of scraping HTML.

- **Endpoint:** `https://www.serhiichernenko.com/blog/api/mcp` (production) /
  `http://localhost:4321/api/mcp` (`pnpm dev`)
- **Transport:** MCP Streamable HTTP (JSON-RPC 2.0 over a single POST endpoint)
- **Auth:** none — same trust level as the public RSS feed. Read-only, no
  mutation tools.

## Tools

| Tool                  | Purpose                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| `list_posts`          | List published posts, newest first. Optional `locale`, `tag`, `limit`, `offset`. |
| `get_post`            | Full content (including raw body) of one post by `locale` + `slug`.              |
| `search_posts_by_tag` | Posts matching a tag, optionally scoped to a `locale`.                           |
| `list_tags`           | All tags with post counts, optionally scoped to a `locale`.                      |

All four source from the same `getPublishedPosts()` / `getTagsForLocale()`
helpers (`src/lib/posts.ts`) the HTML pages use, so draft posts and
future-dated `publishedAt` posts are excluded identically everywhere.

## Implementation

`src/lib/mcp.ts` builds a fresh `McpServer` (`@modelcontextprotocol/server`)
per request; `src/pages/api/mcp.ts` wires it up via `createMcpHandler`, which
handles the Streamable HTTP transport, stateless serving, and per-request
instance construction internally. A byte-counted read (not a bare
`content-length` header check — headers can be missing or wrong) rejects
request bodies over 64 KB before the SDK parses them.

## Trying it locally

```bash
pnpm dev
npx @modelcontextprotocol/inspector http://localhost:4321/api/mcp
```

Re-test with `pnpm build && npx wrangler dev` (`http://localhost:8787/blog/api/mcp`,
or send a request with `Host: www.serhiichernenko.com` to check the production
route) before shipping any change here — that's the workerd runtime, not the
Node adapter `pnpm dev` uses, and the two can resolve dependencies differently.
Don't use `pnpm wrangler:dev` for this — it runs `astro preview`, which gives
false 404s on injected/dynamic routes; `wrangler dev` against the real build
is the reliable check.
