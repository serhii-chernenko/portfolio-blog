# MCP server

This blog exposes a read-only [Model Context Protocol](https://modelcontextprotocol.io)
server so AI assistants can query post content directly instead of scraping HTML.

- **Endpoint:** `https://serhiichernenko.com/blog/api/mcp` (production) /
  `http://localhost:4321/blog/api/mcp` (`pnpm dev`)
- **Transport:** MCP Streamable HTTP (JSON-RPC 2.0 over a single POST endpoint)
- **Auth:** none — same trust level as the public RSS feed. Read-only, no
  mutation tools.

## Tools

| Tool                  | Purpose                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `list_posts`          | List published posts, newest first. Optional `locale`, `tag`, `limit`, `offset`.                               |
| `get_post`            | One post by `locale` + `slug`: metadata, `translations` (URL per locale or `null`) and the body as plain text. |
| `search_posts_by_tag` | Posts matching a tag, optionally scoped to a `locale`.                                                         |
| `list_tags`           | All tags with post counts, optionally scoped to a `locale`.                                                    |

All four read from [EmDash](./CMS.md) through the same helpers
(`src/lib/posts.ts`, backed by `src/lib/cms/`) the HTML pages use, always
published content only, so draft posts and future-dated `publishedAt` posts
are excluded identically everywhere. `get_post` returns the body as plain text
flattened from Portable Text (`portableTextToPlainText` in
`src/lib/portable-text.ts`, the same text `llms-full.txt` uses): text blocks,
callout text, fenced code blocks, `[Image: alt]` for images and links for
YouTube embeds. It is not the raw block structure.

This server is separate from EmDash's own content-management MCP at
`/_emdash/api/mcp` (OAuth) and from the `emdash-docs` MCP; see
[`CMS.md`](./CMS.md#ai-tooling).

## Implementation

`src/lib/mcp.ts` builds a fresh `McpServer` (`@modelcontextprotocol/server`)
per request; `src/pages/blog/api/mcp.ts` wires it up via `createMcpHandler`, which
handles the Streamable HTTP transport, stateless serving, and per-request
instance construction internally. A byte-counted read (not a bare
`content-length` header check — headers can be missing or wrong) rejects
request bodies over 64 KB before the SDK parses them.

## Using it from this repo

The repo ships a project-scoped `.mcp.json` registering this server under the
name `portfolio-blog`, pointed at the production URL. Any MCP-aware client
that reads the standard `.mcp.json` project config picks it up automatically:

- **Claude Code** — detects `.mcp.json` on startup and prompts once to approve
  the project-scoped server before it's usable (a security gate for any MCP
  server declared in a repo you didn't author yourself). Approve it, then ask
  things like "what posts are tagged astro on this blog?" — it resolves via
  `list_posts`/`search_posts_by_tag` instead of guessing from training data.
- **[pi](https://github.com/badlogic/pi-mono)** (via
  [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter)) — reads the
  same `.mcp.json` directly, no separate `.pi/mcp.json` override needed; the
  adapter's schema is a superset of the standard `mcpServers` shape (extra
  fields like `lifecycle` are optional additions, not requirements), so one
  file serves both. Confirm via `/mcp` inside pi that `portfolio-blog` shows
  up as detected.
- **Other MCP-aware tools** (Cursor, VS Code Copilot Chat, etc.) generally
  read this same file or a host-specific equivalent — check that tool's own
  docs if it doesn't pick `.mcp.json` up automatically.

No changes needed if you're working against a different branch/deploy — the
URL is fixed to production since the server is read-only and stateless; there
is no reason to point it at a local dev instance unless you're actively
developing the MCP tools themselves (see below).

## Trying it locally

```bash
pnpm dev
npx @modelcontextprotocol/inspector http://localhost:4321/blog/api/mcp
```

Re-test with `pnpm build && npx wrangler dev` (`http://localhost:8787/blog/api/mcp`,
or send a request with `Host: serhiichernenko.com` to check the production
route) before shipping any change here — that's the workerd runtime, not the
Node adapter `pnpm dev` uses, and the two can resolve dependencies differently.
`pnpm wrangler:dev` does the same (build, then `wrangler dev`).
Don't use `pnpm preview` for this — `astro preview` gives false 404s on
injected/dynamic routes.
