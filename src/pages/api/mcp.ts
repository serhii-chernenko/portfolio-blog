export const prerender = false;
import type { APIRoute } from 'astro';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { buildMcpServer } from '../../lib/mcp';

const MAX_BODY_BYTES = 64_000;

// See docs/MCP.md for why a module-scope handler is safe here (fresh McpServer
// per request via the factory argument, no request-scoped capture in the tools).
const handler = createMcpHandler(() => buildMcpServer(), {
	responseMode: 'json',
	onerror: (error) => console.error('[mcp]', error.message),
});

function jsonRpcError(status: number, message: string): Response {
	return new Response(
		JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message } }),
		{
			status,
			headers: { 'content-type': 'application/json' },
		},
	);
}

// Byte-counted, not header-trusted: a missing Content-Length (e.g. chunked
// transfer-encoding) or a malformed one would let an unbounded body past a
// header-only check. Mirrors src/pages/api/subscribe.ts's readLimitedJson.
async function readLimitedBody(request: Request): Promise<unknown> {
	const reader = request.body?.getReader();
	if (!reader) return undefined;

	const chunks: Uint8Array[] = [];
	let bytesRead = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytesRead += value.byteLength;
			if (bytesRead > MAX_BODY_BYTES) {
				await reader.cancel('Request body is too large').catch(() => undefined);
				throw new RangeError('Request body is too large');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	if (bytesRead === 0) return undefined;

	const bytes = new Uint8Array(bytesRead);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export const ALL: APIRoute = async ({ request }) => {
	let parsedBody: unknown;
	try {
		parsedBody = await readLimitedBody(request);
	} catch (error) {
		if (error instanceof RangeError) return new Response('Payload too large', { status: 413 });
		return jsonRpcError(400, 'Parse error');
	}
	return handler.fetch(request, parsedBody === undefined ? undefined : { parsedBody });
};
