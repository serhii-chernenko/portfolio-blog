export function hasSupportedJsonContentType(value: string | null): boolean {
	if (!value) return false;
	const [mediaType, ...parameters] = value.split(';').map((part) => part.trim());
	if (mediaType?.toLowerCase() !== 'application/json') return false;
	let sawCharset = false;
	for (const parameter of parameters) {
		const [rawName, rawValue, extra] = parameter.split('=').map((part) => part.trim());
		if (extra !== undefined || rawName?.toLowerCase() !== 'charset' || sawCharset) return false;
		const charset = rawValue?.replace(/^"|"$/g, '').toLowerCase();
		if (charset !== 'utf-8') return false;
		sawCharset = true;
	}
	return true;
}

export async function readLimitedJson(request: Request, maxBodyBytes: number): Promise<unknown> {
	const rawContentLength = request.headers.get('content-length');
	if (rawContentLength !== null) {
		const contentLength = Number(rawContentLength);
		if (!Number.isInteger(contentLength) || contentLength < 0) {
			throw new SyntaxError('Invalid content length');
		}
		if (contentLength > maxBodyBytes) throw new RangeError('Request body is too large');
	}

	const chunks: Uint8Array[] = [];
	let bytesRead = 0;
	const reader = request.body?.getReader();
	if (reader) {
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				bytesRead += value.byteLength;
				if (bytesRead > maxBodyBytes) {
					await reader.cancel('Request body is too large').catch(() => undefined);
					throw new RangeError('Request body is too large');
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
	}

	const bytes = new Uint8Array(bytesRead);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
