const EXPIRY_MS = 48 * 60 * 60 * 1000;

function b64urlEncode(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function b64urlDecode(input: string): Uint8Array {
	const padded = input.replaceAll('-', '+').replaceAll('_', '/');
	const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
	const s = atob(padded + pad);
	const bytes = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
	return bytes;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(message),
	);
	return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
	return diff === 0;
}

export async function issueToken(
	secret: string,
	email: string,
	purpose: 'confirm' | 'unsubscribe',
	now = Date.now(),
): Promise<string> {
	const expiresAt = now + EXPIRY_MS;
	const payload = `${purpose}:${email}:${expiresAt}`;
	const sig = await hmac(secret, payload);
	return b64urlEncode(new TextEncoder().encode(`${payload}:`)).slice(0, -1) +
		'.' +
		b64urlEncode(sig);
}

export async function verifyToken(
	secret: string,
	token: string,
	purpose: 'confirm' | 'unsubscribe',
	now = Date.now(),
): Promise<{ email: string } | null> {
	const [payloadEncoded, sigEncoded] = token.split('.');
	if (!payloadEncoded || !sigEncoded) return null;
	let payloadStr: string;
	try {
		payloadStr = new TextDecoder().decode(b64urlDecode(payloadEncoded));
	} catch {
		return null;
	}
	// payloadStr ends with ":" from issue
	const cleaned = payloadStr.endsWith(':') ? payloadStr.slice(0, -1) : payloadStr;
	const parts = cleaned.split(':');
	if (parts.length !== 3) return null;
	const [tokenPurpose, email, expiresAtStr] = parts;
	if (tokenPurpose !== purpose) return null;
	const expiresAt = Number(expiresAtStr);
	if (!Number.isFinite(expiresAt) || expiresAt < now) return null;

	const expected = await hmac(secret, `${tokenPurpose}:${email}:${expiresAt}`);
	let actual: Uint8Array;
	try {
		actual = b64urlDecode(sigEncoded);
	} catch {
		return null;
	}
	if (!timingSafeEqual(expected, actual)) return null;
	return { email: email! };
}

export async function hashIp(secret: string, ip: string): Promise<string> {
	const sig = await hmac(secret, `ip:${ip}`);
	return b64urlEncode(sig);
}
