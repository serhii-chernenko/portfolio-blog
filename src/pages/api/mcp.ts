export const prerender = false;
import type { APIRoute } from 'astro';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { buildMcpServer } from '../../lib/mcp';

const MAX_BODY_BYTES = 64_000;

// Module scope = one instance per Worker isolate, shared across requests —
// safe here only because createMcpHandler's factory builds a fresh McpServer
// per request (see buildMcpServer) and every tool reads static content
// collections with no request-scoped value (locals, headers, bindings)
// captured at this scope. If a tool ever needs one, build inside the route
// instead.
const handler = createMcpHandler(() => buildMcpServer(), {
	responseMode: 'json',
	onerror: (error) => console.error('[mcp]', error.message),
});

export const ALL: APIRoute = async ({ request }) => {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (contentLength > MAX_BODY_BYTES) {
		return new Response('Payload too large', { status: 413 });
	}
	return handler.fetch(request);
};
